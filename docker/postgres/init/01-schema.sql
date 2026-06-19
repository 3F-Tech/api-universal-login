-- ============================================
-- 3F Core - DDL completo
-- PostgreSQL 17
-- ============================================
-- Este script roda automaticamente na PRIMEIRA subida do container
-- (diretório /docker-entrypoint-initdb.d). Mantém o schema do Postgres local
-- idêntico ao da VPS, para `prisma db pull` gerar o mesmo schema.prisma.
-- ============================================

-- Função para trigger de updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABELA: bu (Business Units, auto-relacionada)
-- ============================================
CREATE TABLE bu (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  description         TEXT,
  slug                VARCHAR(100) NOT NULL UNIQUE,
  primary_color_hex   VARCHAR(7),
  secondary_color_hex VARCHAR(7),
  parent_id           INTEGER REFERENCES bu(id) ON DELETE SET NULL,
  logo_picture        TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_bu_updated_at BEFORE UPDATE ON bu
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: department
-- ============================================
CREATE TABLE department (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(100),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  INTEGER -- FK adicionada após criar tabela user
);
CREATE TRIGGER trg_department_updated_at BEFORE UPDATE ON department
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: position (nome reservado em SQL)
-- ============================================
CREATE TABLE "position" (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  INTEGER
);
CREATE TRIGGER trg_position_updated_at BEFORE UPDATE ON "position"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: band
-- ============================================
CREATE TABLE band (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  color_hex   VARCHAR(7),
  icon        VARCHAR(100),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  INTEGER
);
CREATE TRIGGER trg_band_updated_at BEFORE UPDATE ON band
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: user (nome reservado em SQL)
-- ============================================
CREATE TABLE "user" (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  personal_email  VARCHAR(150),
  password        VARCHAR(60) NOT NULL,
  birth_date      DATE,
  cpf             VARCHAR(14) UNIQUE,
  cnpj            VARCHAR(18) UNIQUE,
  sex             VARCHAR(10),
  phone           VARCHAR(20),
  instagram       VARCHAR(100),
  linkedin        VARCHAR(200),
  role            VARCHAR(50) NOT NULL,
  department_id   INTEGER REFERENCES department(id) ON DELETE SET NULL,
  position_id     INTEGER REFERENCES "position"(id) ON DELETE SET NULL,
  -- bu_id removido: relação user↔BU agora é N:N via tabela users_bus.
  band_id         INTEGER REFERENCES band(id) ON DELETE SET NULL,
  squad_id        INTEGER, -- FK adicionada após criar tabela squad
  profile_picture TEXT,
  cep             VARCHAR(9),
  street          VARCHAR(200),
  street_number   VARCHAR(20),
  neighborhood    VARCHAR(100),
  complement      VARCHAR(200),
  city            VARCHAR(100),
  state           VARCHAR(50),
  country         VARCHAR(50),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_user_updated_at BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: squad
-- ============================================
CREATE TABLE squad (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  picture     TEXT,
  leader_id   INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
  bu_id       INTEGER REFERENCES bu(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_squad_updated_at BEFORE UPDATE ON squad
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Adicionar FKs que dependiam de tabelas posteriores
-- ============================================
ALTER TABLE "user"     ADD CONSTRAINT fk_user_squad         FOREIGN KEY (squad_id)   REFERENCES squad(id)   ON DELETE SET NULL;
ALTER TABLE department ADD CONSTRAINT fk_department_created_by FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE "position" ADD CONSTRAINT fk_position_created_by   FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE band       ADD CONSTRAINT fk_band_created_by       FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL;

-- ============================================
-- TABELA: system
-- ============================================
CREATE TABLE system (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  description   TEXT,
  link          VARCHAR(500),
  logo_picture  TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_system_updated_at BEFORE UPDATE ON system
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: systems_users (N:N entre user e system)
-- ============================================
CREATE TABLE systems_users (
  id          SERIAL PRIMARY KEY,
  system_id   INTEGER NOT NULL REFERENCES system(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_systems_users UNIQUE (system_id, user_id)
);

-- ============================================
-- TABELA: systems_bus (N:N entre system e bu, PK composta)
-- ============================================
CREATE TABLE systems_bus (
  system_id INTEGER NOT NULL REFERENCES system(id) ON DELETE CASCADE,
  bu_id     INTEGER NOT NULL REFERENCES bu(id) ON DELETE CASCADE,
  PRIMARY KEY (system_id, bu_id)
);

-- ============================================
-- TABELA: users_bus (N:N entre user e bu)
-- from_squad: true = BU do squad (marcada pelo front); false = vínculo manual.
-- ============================================
CREATE TABLE users_bus (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  bu_id      INTEGER NOT NULL REFERENCES bu(id) ON DELETE CASCADE,
  from_squad BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_bus UNIQUE (user_id, bu_id)
);

-- ============================================
-- TABELA: systems_users_access (log de acessos)
-- ============================================
CREATE TABLE systems_users_access (
  id                BIGSERIAL PRIMARY KEY,
  systems_users_id  INTEGER NOT NULL REFERENCES systems_users(id) ON DELETE CASCADE,
  accessed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success           BOOLEAN NOT NULL
);

-- ============================================
-- TABELA: api_key
-- ============================================
CREATE TABLE api_key (
  id            SERIAL PRIMARY KEY,
  system_id     INTEGER NOT NULL REFERENCES system(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  key_hash      VARCHAR(255) NOT NULL UNIQUE,
  key_prefix    VARCHAR(12) NOT NULL,
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    INTEGER REFERENCES "user"(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_api_key_updated_at BEFORE UPDATE ON api_key
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_user_email          ON "user"(email);
CREATE INDEX idx_user_cpf            ON "user"(cpf);
CREATE INDEX idx_user_squad_id       ON "user"(squad_id);
CREATE INDEX idx_user_department_id  ON "user"(department_id);
CREATE INDEX idx_user_is_active      ON "user"(is_active);
CREATE INDEX idx_squad_bu_id         ON squad(bu_id);
CREATE INDEX idx_squad_leader_id     ON squad(leader_id);
CREATE INDEX idx_bu_parent_id        ON bu(parent_id);
CREATE INDEX idx_bu_slug             ON bu(slug);
CREATE INDEX idx_systems_users_user_id    ON systems_users(user_id);
CREATE INDEX idx_systems_users_system_id  ON systems_users(system_id);
CREATE INDEX idx_users_bus_user_id        ON users_bus(user_id);
CREATE INDEX idx_users_bus_bu_id          ON users_bus(bu_id);
CREATE INDEX idx_systems_users_access_systems_users_id ON systems_users_access(systems_users_id);
CREATE INDEX idx_systems_users_access_accessed_at      ON systems_users_access(accessed_at DESC);
CREATE INDEX idx_api_key_system_id   ON api_key(system_id);
CREATE INDEX idx_api_key_key_hash    ON api_key(key_hash);
CREATE INDEX idx_api_key_is_active   ON api_key(is_active);
