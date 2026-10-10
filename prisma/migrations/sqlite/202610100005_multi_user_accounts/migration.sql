PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_User" ("id", "slot", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
SELECT "id", "slot", "name", "email", "emailVerified", "image", "createdAt", "updatedAt" FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_slot_key" ON "User"("slot");

PRAGMA foreign_keys=ON;
