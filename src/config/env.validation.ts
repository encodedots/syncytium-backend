import { plainToInstance } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsUrl,
  IsOptional,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsNumber()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsNumber()
  @IsOptional()
  REDIS_PORT?: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  AUTH0_DOMAIN!: string;

  @IsString()
  AUTH0_CLIENT_ID!: string;

  @IsString()
  AUTH0_CLIENT_SECRET!: string;

  @IsString()
  AUTH0_AUDIENCE!: string;

  @IsString()
  COOKIE_SECRET!: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL!: string;

  @IsUrl({ require_tld: false })
  BACKEND_URL!: string;

  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  LOG_LEVEL: string = 'info';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
