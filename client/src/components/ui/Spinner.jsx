export default function Spinner({ size = 16 }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-ink-200 border-t-blood-600"
      style={{ width: size, height: size }}
    />
  );
}
