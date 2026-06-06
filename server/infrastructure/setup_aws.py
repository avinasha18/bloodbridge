"""One-shot AWS bootstrap helper.

Reads infra JSON definitions from sibling folders and creates:
  - DynamoDB tables
  - Step Functions state machine
  - EventBridge schedule rules

Assumes Lambdas have already been deployed by your CI/CD or SAM/CDK.
Run with valid AWS credentials and AWS_REGION env var set.

This script is intentionally idempotent: existing resources are left
alone with a logged message.
"""

import json
import logging
import os
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
REGION = os.environ.get("AWS_REGION", "ap-south-1")
ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "")


def create_dynamodb_tables() -> None:
    client = boto3.client("dynamodb", region_name=REGION)
    spec = json.loads((ROOT / "dynamodb" / "tables.json").read_text())
    for table in spec["tables"]:
        try:
            client.create_table(**{k: v for k, v in table.items() if k != "TimeToLiveSpecification"})
            logger.info("Created DynamoDB table %s", table["TableName"])
            client.get_waiter("table_exists").wait(TableName=table["TableName"])
            if "TimeToLiveSpecification" in table:
                client.update_time_to_live(
                    TableName=table["TableName"],
                    TimeToLiveSpecification=table["TimeToLiveSpecification"],
                )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ResourceInUseException":
                logger.info("DynamoDB table %s already exists", table["TableName"])
            else:
                raise


def create_step_functions() -> None:
    if not ACCOUNT_ID:
        logger.warning("AWS_ACCOUNT_ID not set — skipping Step Functions creation")
        return
    sfn = boto3.client("stepfunctions", region_name=REGION)
    role_arn = os.environ.get("SFN_ROLE_ARN")
    if not role_arn:
        logger.warning("SFN_ROLE_ARN not set — set it to the role Step Functions should assume")
        return

    definition = (ROOT / "step_functions" / "bin_orchestrator.json").read_text()
    definition = definition.replace("${AWS_REGION}", REGION).replace("${ACCOUNT_ID}", ACCOUNT_ID)

    try:
        resp = sfn.create_state_machine(
            name="BinOrchestrator",
            definition=definition,
            roleArn=role_arn,
            type="STANDARD",
        )
        logger.info("Created state machine %s", resp["stateMachineArn"])
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "StateMachineAlreadyExists":
            logger.info("State machine BinOrchestrator already exists")
        else:
            raise


def create_eventbridge_rules() -> None:
    events = boto3.client("events", region_name=REGION)
    spec = json.loads((ROOT / "eventbridge" / "rules.json").read_text())
    for rule in spec:
        events.put_rule(
            Name=rule["Name"],
            ScheduleExpression=rule["ScheduleExpression"],
            Description=rule["Description"],
            State="ENABLED",
        )
        if ACCOUNT_ID and rule.get("TargetLambda"):
            target_arn = f"arn:aws:lambda:{REGION}:{ACCOUNT_ID}:function:{rule['TargetLambda']}"
            events.put_targets(
                Rule=rule["Name"],
                Targets=[{"Id": "1", "Arn": target_arn}],
            )
        logger.info("Created/updated EventBridge rule %s", rule["Name"])


def main() -> None:
    create_dynamodb_tables()
    create_step_functions()
    create_eventbridge_rules()


if __name__ == "__main__":
    main()
