import { Link } from "react-router-dom";
import {
  Droplets,
  Users,
  MessageSquare,
  MapPin,
  ChevronRight,
} from "lucide-react";

const STEPS = [
  {
    n: 1,
    title: "Create a blood need",
    where: "Blood Needs → New Request",
    to: "/requests/new",
    detail: "Enter hospital, blood type, and urgency. The system ranks matching donors.",
    icon: Droplets,
  },
  {
    n: 2,
    title: "System picks best donors",
    where: "Open any request → Best Donors for This Need",
    to: "/requests",
    detail: "Ranks donors by match score, distance, and show-up history.",
    icon: Users,
  },
  {
    n: 3,
    title: "SMS goes to donors",
    where: "Same request page → Text Messages Sent",
    to: "/requests",
    detail: "Donors receive a text with YES/NO links. First YES becomes the main donor; others go on backup.",
    icon: MessageSquare,
  },
  {
    n: 4,
    title: "You finish the job",
    where: "Same request page → What You Need To Do",
    to: "/requests",
    detail: "Send hospital address, send day-before reminder, then mark Donated or No-Show.",
    icon: MapPin,
  },
];

export default function WorkflowGuide({ compact = false }) {
  if (compact) {
    return (
      <div className="bg-white border border-ink-200 rounded-xl p-4">
        <div className="text-sm font-semibold text-ink-900 mb-2">
          Where does SMS & donor ranking happen?
        </div>
        <p className="text-xs text-ink-600 mb-3">
          Everything happens on a <strong>request page</strong>. Create a need first, then click it
          in the list to see ranking, texts sent, and your action buttons.
        </p>
        <Link
          to="/requests/new"
          className="inline-flex items-center gap-1 text-sm text-blood-700 font-medium hover:underline"
        >
          Start: create a blood need
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blood-50 to-white border border-blood-100 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink-900">
          How this system works (4 steps)
        </h2>
        <p className="text-sm text-ink-600 mt-1">
          You mostly work on <Link to="/requests" className="text-blood-700 underline">Blood Needs</Link>.
          Open any request to see donor ranking, messages sent, and your action buttons.
        </p>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <li
              key={s.n}
              className="bg-white border border-ink-200 rounded-lg p-4 flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-blood-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                {s.n}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-blood-600 shrink-0" />
                  <span className="font-medium text-ink-900 text-sm">{s.title}</span>
                </div>
                <div className="text-xs text-blood-700 font-medium mt-1">{s.where}</div>
                <p className="text-xs text-ink-500 mt-1">{s.detail}</p>
                {s.n === 1 && (
                  <Link
                    to={s.to}
                    className="inline-flex items-center gap-0.5 text-xs text-blood-600 mt-2 hover:underline"
                  >
                    Go there now <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
