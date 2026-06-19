CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS verify_email_otp(
	id 						  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email                     VARCHAR(255) NOT NULL UNIQUE, 
	otp                       VARCHAR(4),
	otp_exp_in                TIMESTAMPTZ,
	is_verified				  BOOL NOT NULL DEFAULT FALSE,
	verification_expires_at	  TIMESTAMPTZ DEFAULT NULL,
	created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);