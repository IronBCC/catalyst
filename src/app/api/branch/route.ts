import { handleBranch } from "@/lib/api/branch";

export const maxDuration = 120;
export const POST = (request: Request) => handleBranch(request);
