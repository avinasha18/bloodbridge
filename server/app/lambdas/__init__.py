"""Lambda handler implementations.

Each module exports both a `run(db)` function (callable from FastAPI for
manual triggers and tests) and a `handler(event, context)` function (the
actual AWS Lambda entry point). The handler simply wires up a DB session
and calls `run`.
"""
