let config: any = {};

config.key = {
   "id": "id",
   "service_account_id": "service_account_id",
   "created_at": "created_at",
   "key_algorithm": "key_algorithm",
   "public_key": "public_key",
   "private_key": "private_key"
}

config.secret = "secret";

config.port = 3000;

config.emailDetail = {
   from: "noreply@domain.ru",
   password: "password",
   to: ['example@domain.ru'],
   subject: "Еженедельный отчет"
};

config.yandexGPTSettings = {
   x_folder_id: "x_folder_id",
   instruction: "Проанализируй сообщения и сделай краткое резюме по ним. Напиши вывод об общем тоне и эмоциональном настрое спрашивающих",
   model: "yandexgpt-32k/rc"
}

export default config;

