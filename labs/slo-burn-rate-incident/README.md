# SLO burn rate и разбор инцидента

Локальный стенд использует `python:3.13.5-alpine3.22` и `prom/prometheus:v3.5.0`. Синтетический сервис экспортирует request/error counters; Prometheus сначала применяет шумный single-window alert, затем корректный multi-window burn-rate alert для SLO 99,9%.

## Прогноз

До отказа посчитайте burn rate для 20% ошибок при error budget 0,1%. Предскажите, чем сигнал по одному короткому окну отличается от пары short/long windows.

## Запуск и healthy-check

```sh
./scripts/start.sh
./scripts/check.sh healthy
```

Target должен быть `up`, а burn rate — ниже 1x.

## Инъекция отказа и проверка

```sh
./scripts/inject-failure.sh
./scripts/check.sh failure
```

Сервис начинает отдавать 20% ошибок. Starter подтверждает высокий burn rate, но не имеет требуемого `SLOMultiWindowBurnRate`.

## Сделайте сами

Прежде чем читать ответ, напишите алерт сами. Правьте `.state/prometheus.rules.yml` — именно этот файл монтирует Prometheus — и примените:

```sh
$EDITOR .state/prometheus.rules.yml
./scripts/apply-my-changes.sh
./scripts/check.sh solution
```

Проверка смотрит на то, что Prometheus реально вычисляет: засчитается любое правило, срабатывающее при такой скорости прожигания. Алерт должен называться `SLOMultiWindowBurnRate`.

## Решение и разбор

```sh
./scripts/apply-solution.sh
./scripts/check.sh solution
```

Сравните rule-файлы в `starter/` и `solution/`. Решение требует одновременно высокий burn rate в окнах 5s и 10s (учебное ускорение production-окон). Быстрое окно даёт чувствительность, длинное защищает от краткого шума. В реальной системе после алерта нужны ownership, runbook, коммуникация и post-incident review.

## Безопасный reset

```sh
./scripts/reset.sh
```

Reset удаляет только контейнеры, сеть, volume и три runtime-файла проекта `sds-slo-burn-rate-incident`; глобальный prune не используется.
