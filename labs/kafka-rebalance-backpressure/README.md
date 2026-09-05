# Kafka: rebalance и backpressure

Изолированный локальный стенд показывает, как остановка consumer и burst от producer превращаются в lag и rebalance. Используются только `apache/kafka:4.0.0`, именованные ресурсы проекта `sds-kafka-rebalance-backpressure` и локальная сеть без опубликованных портов.

## Прогноз

До запуска отказа запишите: что произойдёт с lag, сколько участников останется в consumer group и почему добавление partitions само по себе не лечит медленный consumer.

## Запуск и healthy-check

Требуются Docker и Docker Compose. Из этой директории выполните:

```sh
./scripts/start.sh
./scripts/check.sh healthy
```

Ожидаются три partitions, два consumer и нулевой lag.

## Инъекция отказа и проверка

```sh
./scripts/inject-failure.sh
./scripts/check.sh failure
```

Сценарий останавливает один consumer, приостанавливает второй и публикует 3000 сообщений. Проверка ожидает положительный lag и нарушенную группу.

## Сделайте сами

Прежде чем читать ответ, попробуйте починить сами. Правьте `.state/consumer.properties` — именно этот файл монтируют консьюмеры — и примените:

```sh
$EDITOR .state/consumer.properties
./scripts/apply-my-changes.sh
./scripts/check.sh solution
```

Проверки оценивают работающую группу, а не ваш diff: засчитается любая конфигурация, которая сливает лаг и удерживает двух участников. Повторять можно сколько угодно.

## Решение и разбор

```sh
./scripts/apply-solution.sh
./scripts/check.sh solution
```

Сравните `starter/consumer.properties` и `solution/consumer.properties`. Увеличение batch помогает догнать очередь, но production-решение также требует ограничивать producer, измерять время обработки и выбирать partitions по реальному параллелизму. Lag — симптом несогласованных скоростей, а rebalance добавляет временную недоступность.

## Безопасный reset

```sh
./scripts/reset.sh
```

Reset передаёт явные compose-файл и project name, удаляя только контейнеры, сеть и volume этого стенда. Он не вызывает глобальный prune.
