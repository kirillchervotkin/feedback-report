import { MailerService } from '@nestjs-modules/mailer';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import axios, { AxiosResponse } from 'axios';
const jose = require('node-jose');

interface GPTClient {
  send(text: string): Promise<string>;
}

interface JwtTokenProvider {
  getJWTToken(): Promise<string>;
}

interface Feedback {
  id: number,
  text: string,
  date: Date,
  filename: string,
  pathOfFile: string,
}

interface AimTokenProvider {
  getIamToken(): Promise<string>;
}

export interface EmailDetail {
  to: string[];
  from: string;
  subject: string;
}

interface MailPreparer {
  getEmailDetails(): Promise<EmailDetail>;
}

@Injectable()
export class FeedbackJWTTokenProvider implements JwtTokenProvider {
  constructor(private jwtService: JwtService) { };

  async getJWTToken(): Promise<string> {
    return await this.jwtService.signAsync({ "app": "feedback_report" })
  }
}

class AimTokenProviderError extends Error {
  public innerError: any | undefined;
  constructor(message: string, innerError?: any) {
    super(message);
    this.name = 'AimTokenProviderError';
    this.innerError = innerError;
  }
}

@Injectable()
export class YandexAimTokenProvider implements AimTokenProvider {
  constructor(@Inject('YANDEX_JWT_TOKEN_PROVIDER') private readonly jwtTokenProvider: JwtTokenProvider) { };

  private iamToken: any = null;

  async getIamToken(): Promise<string> {
    let expiresAt: number;
    if (this.iamToken == null) {
      expiresAt = 0;
    } else {
      expiresAt = (new Date(this.iamToken.expiresAt)).getTime() - (Date.now() + 60 * 60 * 1000);
    }
    if (expiresAt <= 0) {
      let jwt = await this.jwtTokenProvider.getJWTToken();
      try {
        let response = await axios.post('https://iam.api.cloud.yandex.net/iam/v1/tokens',
          {
            "jwt": jwt,
          },
          {
            timeout: 10000,
            headers: {
              "Content-Type": "application/json",
            },
          });
        this.iamToken = response.data;
      } catch (error) {
        if (error.response) {
          throw new AimTokenProviderError("Failed to get data from https://iam.api.cloud.yandex.net/iam/v1/tokens"
            + "because server returned a status code " + error.response.status + " and message " + error.response.data.message, error);
        } else if (error.request) {
          throw new AimTokenProviderError("Failed to get data from https://iam.api.cloud.yandex.net/iam/v1/tokens because server is not responding");
        } else {
          throw new AimTokenProviderError("Unknown error");
        }
      }
    }
    return this.iamToken.iamToken;
  }
}

class FeedbackAPIError extends Error {
  public innerError: any | undefined;
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackAPIError';
  }
}

@Injectable()
export class FeedbackAPI {
  constructor(
    @Inject('BASE_URL') private readonly baseUrl: string,
    @Inject('FEEDBACK_JWT_PROVIDER') private readonly jwtTokenProvider: JwtTokenProvider) { }

  async getFeedback(from: Date, to: Date): Promise<Feedback[]> {
    const authToken = await this.jwtTokenProvider.getJWTToken();
    try {

      const response = await axios.get(this.baseUrl + '/feedbacks' + '?' + 'from=' + from.toISOString() + '&' + 'to=' + to.toISOString(), {
        headers: {
          Authorization: 'Bearer ' + authToken,
        },
      });
      return response.data.map((feedback: any) => {
        return {
          "id": Number(feedback.id),
          "text": feedback.text,
          "date": Date.parse(feedback.date),
          "filename": feedback.filename,
          "pathOfFile": feedback.pathOfFile,
        }
      });
    } catch (error) {
      if (error.response) {
        throw new FeedbackAPIError("Failed to get data from " + this.baseUrl + "/feedbacks "
          + "because server returned a status code " + error.response.status + " with message " + error.response.data.message);
      } else if (error.request) {
        throw new FeedbackAPIError("Failed to get data from " + this.baseUrl + "/feedbacks " + "because server is not responding")
      } else {
        throw new FeedbackAPIError("Unknown error with message" + error.message);
      }
    }
  }
}

export class YandexJWTTokenProvider implements JwtTokenProvider {
  constructor(
    @Inject('KEY') private readonly keyId: string,
    @Inject('PRIVATE_KEY') private key: string,
    @Inject('SERVICE_ACCOUNT_ID') private readonly serviceAccountId: string,
  ) {
  }

  async getJWTToken(): Promise<string> {
    let now = Math.floor(new Date().getTime() / 1000);
    let payload = {
      aud: "https://iam.api.cloud.yandex.net/iam/v1/tokens",
      iss: this.serviceAccountId,
      iat: now,
      exp: now + 3600
    };

    let baseKey = await jose.JWK.asKey(this.key, 'pem', { kid: this.keyId, alg: 'PS256' })
    let jwt = await jose.JWS.createSign({ format: 'compact' }, baseKey).update(JSON.stringify(payload)).final();
    return jwt;
  }
}

class GPTClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GPTClientError';
  }
}
@Injectable()
export class yandexGTP implements GPTClient {
  constructor(
    @Inject('X_FOLDER_ID') private readonly x_folder_id: string,
    @Inject('INSTRUCTION') private readonly instruction: string,
    @Inject('MODEL') private readonly model: string,
    @Inject('YANDEX_AIM_TOKEN_PROVIDER') private readonly aimtokenProvider: AimTokenProvider,
  ) { }

  async send(text: string): Promise<string> {
    let iamToken: string;
    try {
      iamToken = await this.aimtokenProvider.getIamToken();
    } catch (error) {
      throw new GPTClientError("Failed to get IAM token with message " + error.innerError.response.data.message);
    }
    let response: any;
    try {
      response = await axios.post('https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        {
          "modelUri": "gpt://" + this.x_folder_id + "/" + this.model,
          "completionOptions": {
            "stream": false,
            "temperature": 0.1,
            "maxTokens": "32000"
          },
          "messages": [
            {
              "role": "system",
              "text": this.instruction
            },
            {
              "role": "user",
              "text": text
            }
          ]
        },
        {
          headers: {
            "Authorization": "Bearer " + iamToken,
            "Content-Type": "application/json",
            "x-folder-id": this.x_folder_id
          },
        });
    } catch (error) {
      if (error.response) {
        throw new GPTClientError("Failed to get data from https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
          + "because server returned a status code " + error.response.status + "with message " + error.response.data.error.message);
      } else if (error.request) {
        throw new GPTClientError("Failed to get data from https://llm.api.cloud.yandex.net/foundationModels/v1/completion because server is not responding");
      } else {
        throw new GPTClientError("Unknown error");
      }
    }
    if (response.data.result.alternatives[0].status == 'ALTERNATIVE_STATUS_CONTENT_FILTER ') {
      throw new GPTClientError("Generation was stopped due to the discovery of potentially sensitive content in the prompt or generated response");
    } else {
      return response.data.result.alternatives[0].message.text;
    }
  }
}

export class FileConfiguredMailPreparer implements MailPreparer {
  constructor(
    private readonly mailerService: MailerService,
    @Inject('EMAIL_DETAIL') private readonly emailDetail: EmailDetail,
  ) { }

  async getEmailDetails(): Promise<EmailDetail> {
    return this.emailDetail;
  }
}
@Injectable()
export class FeedbackReposrtService {
  constructor(
    private readonly mailerService: MailerService,
    @Inject('GPT_CLIENT') private readonly clientGPT: GPTClient,
    @Inject('MAIL_PREPARER') private readonly mailPreparer: MailPreparer,
    private readonly feedbackAPI: FeedbackAPI,
  ) { }
  private readonly logger = new Logger(FeedbackReposrtService.name);
  @Cron('0 0 * * 6')
  async handleCron() {
    try {
      const feedbacks: Feedback[] = await this.feedbackAPI.getFeedback(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date());
      if (feedbacks.length) {
        let allFeedbacks: string = feedbacks.reduce<string>((accFeedbacks: string, curFeedback: Feedback) => {
          return accFeedbacks + curFeedback.text + '\n\n';
        }, "");
        const emailText: string = await this.clientGPT.send(allFeedbacks);
        const emailDetails: EmailDetail = await this.mailPreparer.getEmailDetails();
        await this.mailerService.sendMail({
          to: emailDetails.to,
          from: emailDetails.from,
          subject: emailDetails.subject,
          text: emailText,
          html: emailText
        });
        this.logger.log('Email sent');
      }
    } catch (error) {
      this.logger.error(error);
    }
  }
}
