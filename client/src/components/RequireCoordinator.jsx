import { Navigate, useLocation } from "react-router-dom";
import { isCoordinatorAuthed } from "../lib/auth";

export default function RequireCoordinator({ children }) {
  const location = useLocation();
  if (!isCoordinatorAuthed()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return children;
}
