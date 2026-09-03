import { handleBranch } from "@/lib/api/branch";

export const maxDuration = 60;
export const POST = (request: Request) => handleBranch(request);
