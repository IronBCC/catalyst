import { handleBranch } from "@/lib/api/branch";

export const POST = (request: Request) => handleBranch(request);
