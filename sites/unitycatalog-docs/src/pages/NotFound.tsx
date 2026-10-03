import { Link } from "react-router-dom";
import Shell from "../components/layout/Shell";

export default function NotFound() {
  return (
    <Shell>
      <article className="prose">
        <h1>Page not found</h1>
        <p>
          That page doesn't exist. <Link to="/">Back to the docs home.</Link>
        </p>
      </article>
    </Shell>
  );
}
