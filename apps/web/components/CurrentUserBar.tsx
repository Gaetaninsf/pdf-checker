import { useState, useEffect } from "react";

export default function CurrentUserBar() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => setEmail(data.email ?? null))
      .catch(() => {});
  }, []);

  if (!email) return null;

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 text-sm text-gray-600">
      Signed in as{" "}
      <span className="font-medium text-gray-900">{email}</span>
    </div>
  );
}
