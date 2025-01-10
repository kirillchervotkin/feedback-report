import { Module } from '@nestjs/common';
import {
  FeedbackReposrtService,
  yandexGTP,
  YandexJWTTokenProvider,
  FeedbackJWTTokenProvider,
  YandexAimTokenProvider,
  FeedbackAPI,
  FileConfiguredMailPreparer
} from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { MailerModule, MailerService } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';
import config from './config';
import { JwtModule, JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: config.secret,
      signOptions: { expiresIn: '60s' },
    }),
    ScheduleModule.forRoot(),
    MailerModule.forRoot({
      transport: {
        host: 'smtp.yandex.ru',
        port: 465,
        auth: {
          user: config.from,
          pass: config.password,
        },
      },
      defaults: {
        from: '"nest-modules" <noreply@itplan.ru>',
      },
      template: {
        dir: __dirname + '/templates',
        adapter: new PugAdapter(),
        options: {
          strict: true,
        },
      },
    }),],
  controllers: [],
  providers: [
    FeedbackReposrtService,
    FeedbackAPI,
    FeedbackJWTTokenProvider,
    { provide: 'KEY', useValue: config.key.id },
    { provide: 'PRIVATE_KEY', useValue: config.key.private_key },
    { provide: 'SERVICE_ACCOUNT_ID', useValue: config.key.service_account_id },
    { provide: 'YANDEX_JWT_TOKEN_PROVIDER', useClass: YandexJWTTokenProvider },
    { provide: 'X_FOLDER_ID', useValue: config.yandexGPTSettings.x_folder_id },
    { provide: 'INSTRUCTION', useValue: config.yandexGPTSettings.instruction },
    { provide: 'MODEL', useValue: config.yandexGPTSettings.model },
    { provide: 'GPT_CLIENT', useClass: yandexGTP },
    { provide: 'FEEDBACK_JWT_PROVIDER', useClass: FeedbackJWTTokenProvider },
    { provide: 'YANDEX_AIM_TOKEN_PROVIDER', useClass: YandexAimTokenProvider },
    { provide: 'BASE_URL', useValue: config.baseUrl },
    { provide: 'MAIL_PREPARER', useClass: FileConfiguredMailPreparer },
    { provide: 'EMAIL_DETAIL', useValue: config.emailDetail },
  ],
  exports: []
})
export class AppModule { }
