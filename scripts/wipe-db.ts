import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter });

async function main() {
  const results: Record<string, number> = {};

  results.taskDependency    = (await prisma.taskDependency.deleteMany()).count;
  results.commentReaction   = (await prisma.commentReaction.deleteMany()).count;
  results.activity          = (await prisma.activity.deleteMany()).count;
  results.comment           = (await prisma.comment.deleteMany()).count;
  results.checklistItem     = (await prisma.checklistItem.deleteMany()).count;
  results.checklist         = (await prisma.checklist.deleteMany()).count;
  results.timeEntry         = (await prisma.timeEntry.deleteMany()).count;
  results.customFieldValue  = (await prisma.customFieldValue.deleteMany()).count;
  results.taskAssignee      = (await prisma.taskAssignee.deleteMany()).count;
  results.taskWatcher       = (await prisma.taskWatcher.deleteMany()).count;
  results.taskTag           = (await prisma.taskTag.deleteMany()).count;
  results.attachment        = (await prisma.attachment.deleteMany()).count;
  results.notification      = (await prisma.notification.deleteMany()).count;
  results.favorite          = (await prisma.favorite.deleteMany()).count;
  results.task              = (await prisma.task.deleteMany()).count;
  results.taskTemplate      = (await prisma.taskTemplate.deleteMany()).count;
  results.view              = (await prisma.view.deleteMany()).count;
  results.customFieldOption = (await prisma.customFieldOption.deleteMany()).count;
  results.customField       = (await prisma.customField.deleteMany()).count;
  results.status            = (await prisma.status.deleteMany()).count;
  results.list              = (await prisma.list.deleteMany()).count;
  results.folder            = (await prisma.folder.deleteMany()).count;
  results.tag               = (await prisma.tag.deleteMany()).count;
  results.space             = (await prisma.space.deleteMany()).count;
  results.workspaceMember   = (await prisma.workspaceMember.deleteMany()).count;
  results.workspace         = (await prisma.workspace.deleteMany()).count;

  console.log('Deleted:', JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
