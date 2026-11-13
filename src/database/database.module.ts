import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from './naming.strategy';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('database.url');
        const ssl = config.get<boolean>('database.ssl')
          ? { rejectUnauthorized: false }
          : false;
        const base = {
          type: 'postgres' as const,
          ssl,
          autoLoadEntities: true,
          namingStrategy: new SnakeNamingStrategy(),
          synchronize: false,
          logging: config.get<boolean>('database.logging') ?? false,
          extra: {
            application_name: 'versys',
          },
        };
        if (url) {
          return { ...base, url };
        }
        return {
          ...base,
          host: config.getOrThrow<string>('database.host'),
          port: config.getOrThrow<number>('database.port'),
          username: config.getOrThrow<string>('database.username'),
          password: config.getOrThrow<string>('database.password'),
          database: config.getOrThrow<string>('database.database'),
        };
      },
    }),
  ],
})
export class DatabaseModule {}
