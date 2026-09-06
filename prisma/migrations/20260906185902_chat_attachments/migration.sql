-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "messageId" TEXT,
ALTER COLUMN "taskId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
