import { handleThesis } from "@/lib/api/thesis";

export const maxDuration = 60;
export const POST = (request: Request) => handleThesis(request);
