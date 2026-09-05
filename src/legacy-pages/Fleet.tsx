import { Navigate } from "react-router-dom";

/** Fleet operations now live in the dedicated Fleet product. */
const Fleet = () => <Navigate to="/dashboard" replace />;

export default Fleet;
