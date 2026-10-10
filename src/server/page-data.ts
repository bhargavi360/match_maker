import "server-only";
import { redirect } from "next/navigation";
import { AppError } from "./errors";
export async function pageData<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof AppError && error.status === 401) redirect("/login"); throw error; }
}
