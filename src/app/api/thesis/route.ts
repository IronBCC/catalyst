import { handleThesis } from "@/lib/api/thesis";

export const maxDuration = 120;
export const POST = (request: Request) => handleThesis(request);
