import { getAuthors } from "../../authors";
import { AuthorCard } from "../AuthorBadge";

interface BlogContributorsProps {
  byline?: string;
}

export default function BlogContributors({ byline }: BlogContributorsProps) {
  const authors = getAuthors(byline);
  if (authors.length === 0) return null;

  return (
    <section className="blog-contributors" aria-label="Contributors">
      <p className="blog-aside-title">Contributors</p>
      <ul className="blog-contributors-list">
        {authors.map((author) => (
          <li key={author.id}>
            <AuthorCard author={author} />
          </li>
        ))}
      </ul>
    </section>
  );
}
