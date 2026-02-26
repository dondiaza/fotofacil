-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STORE', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('MISSING_UPLOAD');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePw" BOOLEAN NOT NULL DEFAULT true,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deadlineTime" TEXT,
    "driveFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadDay" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "driveFolderId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadFile" (
    "id" TEXT NOT NULL,
    "uploadDayId" TEXT NOT NULL,
    "slotName" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "originalFilename" TEXT NOT NULL,
    "finalFilename" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "driveWebViewLink" TEXT,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "AlertType" NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromRole" "Role" NOT NULL,
    "text" TEXT NOT NULL,
    "attachmentDriveFileId" TEXT,
    "attachmentWebViewLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_storeId_idx" ON "User"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_storeCode_key" ON "Store"("storeCode");

-- CreateIndex
CREATE INDEX "Store_isActive_idx" ON "Store"("isActive");

-- CreateIndex
CREATE INDEX "SlotTemplate_storeId_order_idx" ON "SlotTemplate"("storeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "SlotTemplate_name_storeId_key" ON "SlotTemplate"("name", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadDay_storeId_date_key" ON "UploadDay"("storeId", "date");

-- CreateIndex
CREATE INDEX "UploadDay_date_status_idx" ON "UploadDay"("date", "status");

-- CreateIndex
CREATE INDEX "UploadFile_uploadDayId_slotName_idx" ON "UploadFile"("uploadDayId", "slotName");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_storeId_date_type_key" ON "Alert"("storeId", "date", "type");

-- CreateIndex
CREATE INDEX "Alert_date_resolvedAt_idx" ON "Alert"("date", "resolvedAt");

-- CreateIndex
CREATE INDEX "Message_storeId_createdAt_idx" ON "Message"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_readAt_idx" ON "Message"("readAt");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_createdAt_idx" ON "AuditLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadDay" ADD CONSTRAINT "UploadDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadFile" ADD CONSTRAINT "UploadFile_uploadDayId_fkey" FOREIGN KEY ("uploadDayId") REFERENCES "UploadDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
