-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflow" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "seed" INTEGER,
    "steps" INTEGER NOT NULL,
    "cfg" REAL NOT NULL,
    "samplerName" TEXT NOT NULL DEFAULT 'euler',
    "scheduler" TEXT NOT NULL DEFAULT 'normal',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "denoise" REAL,
    "strength" REAL,
    "inputImagePath" TEXT,
    "previewPath" TEXT,
    "workflowJson" JSONB,
    "modelConfig" JSONB,
    "comfyPromptId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Job" ("cfg", "comfyPromptId", "createdAt", "denoise", "errorMessage", "height", "id", "inputImagePath", "modelConfig", "negativePrompt", "previewPath", "progress", "prompt", "seed", "status", "steps", "strength", "updatedAt", "width", "workflow", "workflowJson") SELECT "cfg", "comfyPromptId", "createdAt", "denoise", "errorMessage", "height", "id", "inputImagePath", "modelConfig", "negativePrompt", "previewPath", "progress", "prompt", "seed", "status", "steps", "strength", "updatedAt", "width", "workflow", "workflowJson" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
