-- CreateEnum
CREATE TYPE "GradeKind" AS ENUM ('LESSON', 'ORAL', 'HOMEWORK', 'INDEPENDENT', 'QUIZ', 'TEST', 'DICTATION', 'ESSAY', 'LAB', 'PROJECT', 'EXAM', 'OTHER');

-- AlterEnum
ALTER TYPE "Privilege" ADD VALUE 'PARENT';

-- CreateTable
CREATE TABLE "ParentLink" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "lessonNumber" INTEGER,
    "value" INTEGER NOT NULL,
    "kind" "GradeKind" NOT NULL DEFAULT 'LESSON',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "comment" TEXT NOT NULL DEFAULT '',
    "teacherId" TEXT,
    "workId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentLink_childId_idx" ON "ParentLink"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentLink_parentId_childId_key" ON "ParentLink"("parentId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_workId_key" ON "Grade"("workId");

-- CreateIndex
CREATE INDEX "Grade_classId_subjectId_date_idx" ON "Grade"("classId", "subjectId", "date");

-- CreateIndex
CREATE INDEX "Grade_studentId_date_idx" ON "Grade"("studentId", "date");

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
