import { forwardRef, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { FirebaseController } from './firebase.controller';
import { AuthModule } from 'src/auth/auth.module';
import { AuthService } from 'src/auth/services/auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/auth/entities/user.entity';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [FirebaseController],
  providers: [FirebaseService],
})
export class FirebaseModule {}
