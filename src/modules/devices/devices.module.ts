import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceTokenEntity } from './entities/device-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceTokenEntity])],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
