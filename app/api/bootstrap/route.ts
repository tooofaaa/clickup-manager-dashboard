import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceTree } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { route, ApiError } from "@/lib/api-helpers";
import { getCUWorkspaceTree } from "@/lib/clickup-workspace";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Not authenticated");

  // never leak passwordHash to the client
  const currentUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    color: user.color,
    avatarUrl: user.avatarUrl,
  };

  if (process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_TEAM_ID) {
    const cuWorkspace = await getCUWorkspaceTree();
    return NextResponse.json({ currentUser, workspace: cuWorkspace, favorites: [] });
  }

  const workspace = await getWorkspaceTree();
  if (!workspace) throw new ApiError(404, "No workspace found");

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    select: { listId: true },
  });

  return NextResponse.json({ currentUser, workspace, favorites: favorites.map((f) => f.listId) });
});
