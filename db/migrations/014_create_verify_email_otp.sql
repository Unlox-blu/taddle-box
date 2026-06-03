CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS verify_email_otp(
	id 						  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email                     VARCHAR(255) NOT NULL UNIQUE, 
	otp                       VARCHAR(4),
	exp_in                    TIMESTAMPTZ,
	is_used 				  BOOl NOT NULL DEFAULT FALSE,
	is_verified				  BOOl NOT NULL DEFAULT FALSE,
	created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);