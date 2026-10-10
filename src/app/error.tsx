"use client";
import { Button } from "@/components/ui";
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) { return <div className="empty-state panel" role="alert"><h1>The screen could not open.</h1><p>Try loading this screen again. Check the current saved state before repeating an operation.</p><Button onClick={retry}>Try again</Button></div>; }
