/** Animated "typing" bubble shown at the end of the message list. */
export function TypingIndicator({ name }) {
  return (
    <div className="mt-2 flex px-3 sm:px-4" role="status">
      <span className="sr-only">{name} is typing</span>
      <span
        aria-hidden="true"
        className="inline-flex items-center gap-1 rounded-bubble rounded-bl-sm bg-bubble-in px-3.5 py-3"
      >
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="size-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none"
          />
        ))}
      </span>
    </div>
  );
}
