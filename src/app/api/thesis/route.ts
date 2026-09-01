import { handleThesis } from "@/lib/api/thesis";

export const POST = (request: Request) => handleThesis(request);
