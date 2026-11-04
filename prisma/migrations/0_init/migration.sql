-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "api_key" (
    "id" SERIAL NOT NULL,
    "system_id" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "band" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color_hex" VARCHAR(7),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "icon" VARCHAR(100),

    CONSTRAINT "band_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bu" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "slug" VARCHAR(100) NOT NULL,
    "primary_color_hex" VARCHAR(7),
    "secondary_color_hex" VARCHAR(7),
    "parent_id" INTEGER,
    "logo_picture" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legal_name" TEXT,
    "legal_nature" TEXT,
    "cnpj" VARCHAR(18),
    "email" VARCHAR(150),
    "phone" VARCHAR(20),
    "cep" VARCHAR(9),
    "street" VARCHAR(200),
    "street_number" VARCHAR(20),
    "complement" VARCHAR(200),
    "neighborhood" VARCHAR(100),
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "country" VARCHAR(50),
    "email_domain" VARCHAR(255),

    CONSTRAINT "bu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "department_id" INTEGER,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "picture" TEXT,
    "leader_id" INTEGER,
    "bu_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "link" VARCHAR(500),
    "logo_picture" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "systems_bus" (
    "system_id" INTEGER NOT NULL,
    "bu_id" INTEGER NOT NULL,

    CONSTRAINT "systems_bus_pkey" PRIMARY KEY ("system_id","bu_id")
);

-- CreateTable
CREATE TABLE "systems_users" (
    "id" SERIAL NOT NULL,
    "system_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" VARCHAR(50),

    CONSTRAINT "systems_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "systems_users_access" (
    "id" BIGSERIAL NOT NULL,
    "systems_users_id" INTEGER NOT NULL,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "wrong_password" BOOLEAN,

    CONSTRAINT "systems_users_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "personal_email" VARCHAR(150),
    "password" VARCHAR(60) NOT NULL,
    "birth_date" DATE,
    "cpf" VARCHAR(14),
    "cnpj" VARCHAR(18),
    "sex" VARCHAR(10),
    "phone" VARCHAR(20),
    "instagram" VARCHAR(100),
    "linkedin" VARCHAR(200),
    "role" VARCHAR(50) NOT NULL,
    "department_id" INTEGER,
    "position_id" INTEGER,
    "band_id" INTEGER,
    "squad_id" INTEGER,
    "profile_picture" TEXT,
    "cep" VARCHAR(9),
    "street" VARCHAR(200),
    "street_number" VARCHAR(20),
    "neighborhood" VARCHAR(100),
    "complement" VARCHAR(200),
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "country" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leader_id" INTEGER,
    "contract_link" VARCHAR(500),
    "contract_base64" TEXT,
    "contract_id_clicksign" VARCHAR(100),
    "envelope_id_clicksign" VARCHAR(100),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_bus" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "bu_id" INTEGER NOT NULL,
    "from_squad" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "instagram" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complement" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "representative_name" TEXT,
    "representative_cpf" TEXT,
    "representative_email" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "squad_id" INTEGER,
    "specialist_id" INTEGER,
    "logo_picture" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "common_name" VARCHAR(150),

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_key_hash_key" ON "api_key"("key_hash");

-- CreateIndex
CREATE INDEX "idx_api_key_is_active" ON "api_key"("is_active");

-- CreateIndex
CREATE INDEX "idx_api_key_key_hash" ON "api_key"("key_hash");

-- CreateIndex
CREATE INDEX "idx_api_key_system_id" ON "api_key"("system_id");

-- CreateIndex
CREATE UNIQUE INDEX "bu_slug_key" ON "bu"("slug");

-- CreateIndex
CREATE INDEX "idx_bu_parent_id" ON "bu"("parent_id");

-- CreateIndex
CREATE INDEX "idx_bu_slug" ON "bu"("slug");

-- CreateIndex
CREATE INDEX "idx_position_department_id" ON "position"("department_id");

-- CreateIndex
CREATE INDEX "idx_squad_bu_id" ON "squad"("bu_id");

-- CreateIndex
CREATE INDEX "idx_squad_leader_id" ON "squad"("leader_id");

-- CreateIndex
CREATE INDEX "idx_systems_users_system_id" ON "systems_users"("system_id");

-- CreateIndex
CREATE INDEX "idx_systems_users_user_id" ON "systems_users"("user_id");

-- CreateIndex
CREATE INDEX "idx_systems_users_role" ON "systems_users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "uq_systems_users" ON "systems_users"("system_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_systems_users_access_accessed_at" ON "systems_users_access"("accessed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_systems_users_access_systems_users_id" ON "systems_users_access"("systems_users_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_cpf_key" ON "user"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "user_cnpj_key" ON "user"("cnpj");

-- CreateIndex
CREATE INDEX "idx_user_cpf" ON "user"("cpf");

-- CreateIndex
CREATE INDEX "idx_user_department_id" ON "user"("department_id");

-- CreateIndex
CREATE INDEX "idx_user_email" ON "user"("email");

-- CreateIndex
CREATE INDEX "idx_user_is_active" ON "user"("is_active");

-- CreateIndex
CREATE INDEX "idx_user_squad_id" ON "user"("squad_id");

-- CreateIndex
CREATE INDEX "idx_user_leader_id" ON "user"("leader_id");

-- CreateIndex
CREATE INDEX "idx_users_bus_bu_id" ON "users_bus"("bu_id");

-- CreateIndex
CREATE INDEX "idx_users_bus_user_id" ON "users_bus"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_bus" ON "users_bus"("user_id", "bu_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_document_key" ON "client"("document");

-- CreateIndex
CREATE INDEX "idx_client_email" ON "client"("email");

-- CreateIndex
CREATE INDEX "idx_client_is_active" ON "client"("is_active");

-- CreateIndex
CREATE INDEX "idx_client_specialist_id" ON "client"("specialist_id");

-- CreateIndex
CREATE INDEX "idx_client_squad_id" ON "client"("squad_id");

-- CreateIndex
CREATE INDEX "idx_client_status" ON "client"("status");

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "system"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "band" ADD CONSTRAINT "fk_band_created_by" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bu" ADD CONSTRAINT "bu_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "bu"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "fk_department_created_by" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "fk_position_created_by" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad" ADD CONSTRAINT "squad_bu_id_fkey" FOREIGN KEY ("bu_id") REFERENCES "bu"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad" ADD CONSTRAINT "squad_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "systems_bus" ADD CONSTRAINT "systems_bus_bu_id_fkey" FOREIGN KEY ("bu_id") REFERENCES "bu"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "systems_bus" ADD CONSTRAINT "systems_bus_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "system"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "systems_users" ADD CONSTRAINT "systems_users_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "system"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "systems_users" ADD CONSTRAINT "systems_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "systems_users_access" ADD CONSTRAINT "systems_users_access_systems_users_id_fkey" FOREIGN KEY ("systems_users_id") REFERENCES "systems_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "fk_user_squad" FOREIGN KEY ("squad_id") REFERENCES "squad"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_band_id_fkey" FOREIGN KEY ("band_id") REFERENCES "band"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users_bus" ADD CONSTRAINT "users_bus_bu_id_fkey" FOREIGN KEY ("bu_id") REFERENCES "bu"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users_bus" ADD CONSTRAINT "users_bus_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_specialist_id_fkey" FOREIGN KEY ("specialist_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squad"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
