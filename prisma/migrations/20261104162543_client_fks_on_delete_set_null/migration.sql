-- USR-001: as FKs de client saíram como NO ACTION e bloqueavam DELETE /users/:id e
-- DELETE /squads/:id (409 FK_CONSTRAINT). Regra geral da Core: FK nullable = ON DELETE SET NULL.

-- DropForeignKey
ALTER TABLE "client" DROP CONSTRAINT "client_created_by_fkey";

-- DropForeignKey
ALTER TABLE "client" DROP CONSTRAINT "client_specialist_id_fkey";

-- DropForeignKey
ALTER TABLE "client" DROP CONSTRAINT "client_squad_id_fkey";

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squad"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
