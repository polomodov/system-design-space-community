# System Design Space Community

Открытые лаборатории, исправления и проверки [System Design Space](https://system-design.space/). Исходники сайта разрабатываются отдельно. Собственные файлы этого проекта распространяются под MIT; сторонние Docker-образы сохраняют свои лицензии.

[English](README.en.md) · [Исправления](https://github.com/polomodov/system-design-space-community/issues/new/choose) · [Релизы](https://github.com/polomodov/system-design-space-community/releases)

## Скачать лабораторию

Выберите архив нужной лаборатории в закреплённом на сайте релизе. Проверьте SHA-256 по `SHA256SUMS`, распакуйте архив и перейдите в `labs/<lab-id>`. В этой директории находятся README.md, README.en.md, starter, solution и scripts. Первый запуск требует Docker, Docker Compose и сети для загрузки образов. Node.js для прохождения лаборатории не нужен.

```sh
tar -xzf <lab-id>-<version>.tar.gz
cd labs/<lab-id>
./scripts/start.sh
./scripts/check.sh healthy
./scripts/inject-failure.sh
./scripts/check.sh failure
./scripts/apply-solution.sh
./scripts/check.sh solution
./scripts/reset.sh
```

Стенды: `kafka-rebalance-backpressure`, `retry-storm-outbox`, `slo-burn-rate-incident`. В outbox-лабе пароль учебный, используется только в изолированной сети Compose без опубликованных портов.

## Участие

Для лабораторий предлагайте PR здесь и меняйте обе локали. Для исправления сайта создайте Issue с URL, текущим поведением, предложением и источником. Требуется аккаунт GitHub; сообщение отправляется только после вашего подтверждения. Редактор проверяет обращение, публикует исправление на сайте и затем закрывает Issue.

## Проверки и релизы

Node 24: `npm ci`, `npm test`, `npm run check:labs:manifests`, `npm run check:labs`. Полный Docker smoke запускается последовательно и завершает каждый стенд scoped reset. Workflow Release вручную принимает `vX.Y.Z`, проверяет текущий main, создаёт тег и публикует архивы только после успешного smoke. Выпуск содержит `community-labs.json`, SHA256SUMS и архив каждой лабы. Сайт принимает версию отдельным изменением; новый релиз не переключает его автоматически.

## Публичный аудит

`AUDIT_SITE_URL=https://system-design.space/ npm run audit:layout` и `npm run audit:links` проверяют публичные страницы. Для локального preview укажите его URL. Аудит читает `data/site-audit.v1.json`, ждёт интерактивности и проверяет идентичность публикации до/после. Отчёты в `reports/`; смена публикации означает incomplete. Недельные аудиты не являются обязательной проверкой публикации сайта.
