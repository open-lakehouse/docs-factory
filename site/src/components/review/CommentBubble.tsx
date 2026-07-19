interface CommentBubbleProps {
  login?: string;
  body?: string;
  reply?: boolean;
}

export default function CommentBubble({ login, body, reply }: CommentBubbleProps) {
  return (
    <div className={`review-comment${reply ? " reply" : ""}`}>
      {login && <span className="review-author">{login}</span>}
      {body && <p className="review-body">{body}</p>}
    </div>
  );
}
