#!/usr/bin/env bash
#
# Развёртывание edway.space на Debian.
# Ставит Docker и NGINX, собирает и запускает стек, выпускает сертификат
# Let's Encrypt и создаёт системного администратора. Все параметры — в
# deploy.conf (см. deploy.conf.example). Повторный запуск обновляет платформу.
#
# Запуск:  sudo ./deploy.sh [--config FILE] [--check] [--skip-packages]

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deploy.conf"
CHECK_ONLY=no
SKIP_PACKAGES=no

NGINX_SITE=/etc/nginx/sites-available/edway.conf
NGINX_LINK=/etc/nginx/sites-enabled/edway.conf
ACME_ROOT=/var/www/letsencrypt
ERROR_PAGES_DIR=/var/www/edway-errors
SELF_SIGNED_DIR=/etc/ssl/edway
RENEW_HOOK=/etc/letsencrypt/renewal-hooks/deploy/edway-nginx.sh

if [[ -t 1 ]]; then
	C_RESET=$'\033[0m'; C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_BOLD=$'\033[1m'
else
	C_RESET=''; C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_BOLD=''
fi

step() { printf '\n%s==>%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
info() { printf '    %s\n' "$*"; }
ok() { printf '    %sготово%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '%sвнимание:%s %s\n' "$C_WARN" "$C_RESET" "$*" >&2; }
die() { printf '%sошибка:%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; exit 1; }

trap 'die "сбой на строке $LINENO (команда: $BASH_COMMAND)"' ERR

usage() {
	cat <<'EOF'
Развёртывание edway.space.

  sudo ./deploy.sh                  полное развёртывание (повторный запуск = обновление)
  sudo ./deploy.sh --check          проверить конфигурацию и окружение, ничего не менять
  sudo ./deploy.sh --skip-packages  не трогать apt-пакеты (Docker и NGINX уже стоят)
  ./deploy.sh --help                эта справка

  --config FILE                     путь к конфигурации (по умолчанию ./deploy.conf)
EOF
}

parse_args() {
	while [[ $# -gt 0 ]]; do
		case $1 in
			--config) [[ $# -ge 2 ]] || die "--config требует путь к файлу"; CONFIG_FILE=$2; shift 2 ;;
			--check) CHECK_ONLY=yes; shift ;;
			--skip-packages) SKIP_PACKAGES=yes; shift ;;
			-h|--help) usage; exit 0 ;;
			*) die "неизвестный аргумент: $1 (--help для справки)" ;;
		esac
	done
}

# Разбор строки «КЛЮЧ=значение». Конфиг именно читается, а не выполняется:
# source принял бы значение с пробелами за команду. Кавычки вокруг значения
# снимаются, если их поставили, но обязательными не являются.
read_config() {
	local file=$1 line key value trimmed
	while IFS= read -r line || [[ -n $line ]]; do
		line=${line%$'\r'}
		trimmed=${line#"${line%%[![:space:]]*}"}
		[[ -z $trimmed || $trimmed == '#'* ]] && continue
		if [[ ! $trimmed =~ ^(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
			warn "строка конфигурации пропущена, не похожа на «КЛЮЧ=значение»: $trimmed"
			continue
		fi
		key=${BASH_REMATCH[2]}
		value=${BASH_REMATCH[3]}
		value=${value#"${value%%[![:space:]]*}"}
		value=${value%"${value##*[![:space:]]}"}
		if [[ ${#value} -ge 2 && $value == \"*\" ]]; then
			value=${value:1:${#value}-2}
		elif [[ ${#value} -ge 2 && $value == \'*\' ]]; then
			value=${value:1:${#value}-2}
		fi
		printf -v "$key" '%s' "$value"
	done <"$file"
}

load_config() {
	[[ -f $CONFIG_FILE ]] || die "нет файла конфигурации $CONFIG_FILE — скопируйте deploy.conf.example в deploy.conf и заполните его"
	read_config "$CONFIG_FILE"

	: "${DOMAIN:=}"
	: "${ACME_EMAIL:=}"
	: "${TLS_MODE:=letsencrypt}"
	: "${LETSENCRYPT_STAGING:=no}"
	: "${APP_DIR:=$SCRIPT_DIR}"
	: "${HTTP_PORT:=8030}"
	: "${HTTP_BIND:=127.0.0.1}"
	: "${INSTALL_DOCKER:=yes}"
	: "${INSTALL_NGINX:=yes}"
	: "${DISABLE_CONFLICTING:=yes}"
	: "${FIREWALL:=no}"
	: "${SSH_PORT:=22}"
	: "${POSTGRES_USER:=edway}"
	: "${POSTGRES_PASSWORD:=}"
	: "${POSTGRES_DB:=edway}"
	: "${JWT_SECRET:=}"
	: "${ADMIN_LOGIN:=admin}"
	: "${TOTP_ISSUER:=edway.space}"
	: "${SESSION_DAYS:=30}"
	: "${LOGIN_RATE_LIMIT:=20}"
	: "${BACKUP_BEFORE_DEPLOY:=yes}"
	: "${BACKUP_KEEP:=10}"

	ENV_FILE="$APP_DIR/.env"
	BACKUP_DIR="$APP_DIR/backups"
}

validate_config() {
	[[ -n $DOMAIN ]] || die "в конфигурации не задан DOMAIN"
	[[ $DOMAIN =~ ^[A-Za-z0-9.-]+$ ]] || die "DOMAIN содержит недопустимые символы: $DOMAIN"
	[[ $HTTP_PORT =~ ^[0-9]+$ ]] || die "HTTP_PORT должен быть числом"
	[[ $SSH_PORT =~ ^[0-9]+$ ]] || die "SSH_PORT должен быть числом"
	[[ $SESSION_DAYS =~ ^[0-9]+$ ]] || die "SESSION_DAYS должен быть числом"
	[[ $ADMIN_LOGIN =~ ^[a-z0-9._-]{3,40}$ ]] || die "ADMIN_LOGIN — латиница, цифры, точка, дефис; от 3 символов"

	case $TLS_MODE in
		letsencrypt)
			[[ -n $ACME_EMAIL ]] || die "при TLS_MODE=letsencrypt нужно указать ACME_EMAIL"
			[[ $ACME_EMAIL == *@*.* ]] || die "ACME_EMAIL не похож на адрес почты: $ACME_EMAIL"
			;;
		selfsigned|off) ;;
		*) die "TLS_MODE может быть letsencrypt, selfsigned или off (сейчас: $TLS_MODE)" ;;
	esac

	[[ -f $SCRIPT_DIR/docker-compose.yml ]] || die "рядом со скриптом нет docker-compose.yml — запускайте его из каталога проекта"
	ok "конфигурация корректна: $DOMAIN, TLS_MODE=$TLS_MODE, каталог $APP_DIR"
}

require_root() {
	[[ $EUID -eq 0 ]] || die "нужны права root: запустите через sudo"
}

detect_os() {
	[[ -f /etc/os-release ]] || die "не удалось определить дистрибутив (нет /etc/os-release)"
	# shellcheck disable=SC1091
	source /etc/os-release
	OS_ID=${ID:-unknown}
	OS_CODENAME=${VERSION_CODENAME:-}
	case $OS_ID in
		debian|ubuntu) ;;
		*) die "скрипт рассчитан на Debian (подойдёт и Ubuntu), обнаружено: $OS_ID" ;;
	esac
	[[ -n $OS_CODENAME ]] || die "не удалось определить кодовое имя выпуска $OS_ID"
	command -v systemctl >/dev/null || die "нужен systemd (systemctl не найден)"
	ok "система: ${PRETTY_NAME:-$OS_ID $OS_CODENAME}"
}

check_dns() {
	local server_ip domain_ip
	server_ip=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
	domain_ip=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
	if [[ -z $domain_ip ]]; then
		warn "домен $DOMAIN сейчас не резолвится — Let's Encrypt не выдаст сертификат, пока не появится A-запись"
		return
	fi
	if [[ -n $server_ip && $server_ip != "$domain_ip" ]]; then
		warn "домен $DOMAIN указывает на $domain_ip, а внешний адрес сервера — $server_ip; проверьте DNS"
	else
		ok "DNS: $DOMAIN → $domain_ip"
	fi
}

port_owner() {
	ss -lntp "sport = :$1" 2>/dev/null | awk -F'"' 'NR > 1 && /users:/ {print $2; exit}' || true
}

check_ports() {
	local port owner
	for port in 80 443; do
		owner=$(port_owner "$port")
		[[ -z $owner ]] && continue
		case $owner in
			nginx) info "порт $port занят nginx — он и будет принимать запросы" ;;
			caddy|apache2|httpd) info "порт $port занят $owner — его потребуется остановить (DISABLE_CONFLICTING=$DISABLE_CONFLICTING)" ;;
			*) warn "порт $port занят процессом $owner — NGINX не сможет его открыть" ;;
		esac
	done
}

# Имя compose-проекта, под которым поднимается стек.
compose_project() {
	basename "$APP_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-'
}

# Проект контейнера, который сейчас публикует порт приложения.
port_owner_project() {
	local holder
	holder=$(docker ps --filter "publish=$HTTP_PORT" --format '{{.ID}}' 2>/dev/null | head -n1 || true)
	[[ -z $holder ]] && return 0
	docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$holder" 2>/dev/null || true
}

# Порт приложения не должен быть занят посторонним: иначе NGINX отправит
# домен школы в чужое приложение.
check_app_port() {
	local project owner
	project=$(port_owner_project)
	if [[ -n $project ]]; then
		[[ $project == "$(compose_project)" ]] && { info "порт $HTTP_PORT держит текущий стек — это обновление"; return 0; }
		die "порт $HTTP_PORT уже занят контейнером другого проекта: $project
    Укажите в $CONFIG_FILE свободный HTTP_PORT (например, $((HTTP_PORT + 10))) и запустите скрипт снова."
	fi
	owner=$(port_owner "$HTTP_PORT")
	[[ -z $owner || $owner == docker-proxy ]] || die "порт $HTTP_PORT занят процессом $owner — укажите в $CONFIG_FILE свободный HTTP_PORT"
}

apt_install() {
	local missing=() pkg
	for pkg in "$@"; do
		dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "ok installed" || missing+=("$pkg")
	done
	[[ ${#missing[@]} -eq 0 ]] && return 0
	info "устанавливаю: ${missing[*]}"
	DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}" >/dev/null
}

install_base_packages() {
	step "Базовые пакеты"
	info "обновляю списки пакетов"
	apt-get update -qq
	apt_install ca-certificates curl gnupg openssl rsync iproute2 tar gzip
	ok "базовые пакеты на месте"
}

install_docker() {
	step "Docker"
	if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
		ok "Docker и compose уже установлены ($(docker --version | awk '{print $3}' | tr -d ,))"
		return
	fi
	[[ $INSTALL_DOCKER == yes ]] || die "Docker не установлен, а INSTALL_DOCKER=no"
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL "https://download.docker.com/linux/$OS_ID/gpg" -o /etc/apt/keyrings/docker.asc
	chmod a+r /etc/apt/keyrings/docker.asc
	printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
		"$(dpkg --print-architecture)" "$OS_ID" "$OS_CODENAME" >/etc/apt/sources.list.d/docker.list
	apt-get update -qq
	apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	systemctl enable --now docker >/dev/null
	ok "Docker установлен"
}

install_nginx() {
	step "NGINX и certbot"
	if ! command -v nginx >/dev/null; then
		[[ $INSTALL_NGINX == yes ]] || die "NGINX не установлен, а INSTALL_NGINX=no"
		apt_install nginx
	fi
	[[ $TLS_MODE == letsencrypt ]] && apt_install certbot
	systemctl enable nginx >/dev/null 2>&1 || true
	ok "nginx $(nginx -v 2>&1 | awk -F/ '{print $2}')${TLS_MODE:+, TLS: $TLS_MODE}"
}

backup_path() {
	local src=$1 name
	name=$(basename "$src")
	name=${name#.}
	mkdir -p "$BACKUP_DIR"
	cp -a "$src" "$BACKUP_DIR/${name}.$(date +%Y%m%d-%H%M%S).bak"
}

# Caddy или Apache на 80/443 не дадут NGINX принять запросы.
disable_conflicting() {
	local service
	for service in caddy apache2; do
		systemctl is-active --quiet "$service" 2>/dev/null || continue
		step "Остановка $service"
		if [[ $DISABLE_CONFLICTING != yes ]]; then
			warn "$service оставлен включённым (DISABLE_CONFLICTING=no) — NGINX может не занять порты 80/443"
			continue
		fi
		local dir=/etc/$service
		if [[ -d $dir ]]; then
			mkdir -p "$BACKUP_DIR"
			tar -czf "$BACKUP_DIR/$service-config-$(date +%Y%m%d-%H%M%S).tar.gz" -C /etc "$service"
			info "конфигурация $service сохранена в $BACKUP_DIR"
		fi
		systemctl disable --now "$service" >/dev/null 2>&1 || true
		ok "$service остановлен и убран из автозапуска"
	done
}

sync_sources() {
	[[ $APP_DIR == "$SCRIPT_DIR" ]] && return 0
	step "Копирование исходников в $APP_DIR"
	mkdir -p "$APP_DIR"
	rsync -a --delete \
		--exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude '.angular/' \
		--exclude 'uploads/' --exclude '.env' --exclude 'deploy.conf' --exclude 'backups/' \
		"$SCRIPT_DIR"/ "$APP_DIR"/
	cp -f "$CONFIG_FILE" "$APP_DIR/deploy.conf"
	ok "исходники синхронизированы"
}

gen_secret() {
	local raw
	raw=$(openssl rand -base64 96 | tr -dc 'A-Za-z0-9')
	printf '%s' "${raw:0:${1:-32}}"
}

env_value() {
	local key=$1 line
	[[ -f $ENV_FILE ]] || return 1
	line=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1) || return 1
	[[ -n $line ]] || return 1
	printf '%s' "${line#*=}"
}

resolve_secret() {
	local name=$1 length=${2:-32}
	local configured="${!name:-}" existing
	existing=$(env_value "$name" || true)
	if [[ -n $configured ]]; then
		[[ -n $existing && $existing != "$configured" ]] \
			&& warn "$name в deploy.conf отличается от значения в .env — будет записано значение из deploy.conf"
		printf '%s' "$configured"
	elif [[ -n $existing ]]; then
		printf '%s' "$existing"
	else
		gen_secret "$length"
	fi
}

write_env() {
	step "Файл окружения"
	local scheme=https db_pass jwt version
	[[ $TLS_MODE == off ]] && scheme=http
	db_pass=$(resolve_secret POSTGRES_PASSWORD 32)
	jwt=$(resolve_secret JWT_SECRET 64)
	version=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d)

	[[ -f $ENV_FILE ]] && backup_path "$ENV_FILE"
	cat >"$ENV_FILE" <<EOF
# Создано deploy.sh $(date '+%Y-%m-%d %H:%M:%S'). Правки перезапишутся при следующем
# запуске — меняйте значения в deploy.conf.

POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$db_pass
POSTGRES_DB=$POSTGRES_DB

JWT_SECRET=$jwt
PUBLIC_URL=$scheme://$DOMAIN
HTTP_PORT=$HTTP_PORT
HTTP_BIND=$HTTP_BIND
APP_VERSION=$version

SESSION_DAYS=$SESSION_DAYS
ADMIN_LOGIN=$ADMIN_LOGIN
TOTP_ISSUER=$TOTP_ISSUER
LOGIN_RATE_LIMIT=$LOGIN_RATE_LIMIT
EOF
	chmod 600 "$ENV_FILE"
	ok "записан $ENV_FILE"
}

running_container() {
	local service=$1 container
	container=$(cd "$APP_DIR" && docker compose ps -q "$service" 2>/dev/null || true)
	[[ -n $container ]] || return 1
	docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true || return 1
	printf '%s' "$container"
}

prune_backups() {
	# shellcheck disable=SC2012
	ls -1t "$BACKUP_DIR"/$1 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f || true
}

backup_database() {
	[[ $BACKUP_BEFORE_DEPLOY == yes ]] || return 0
	local container dump
	container=$(running_container postgres) || return 0
	step "Резервная копия базы"
	mkdir -p "$BACKUP_DIR"
	dump="$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql.gz"
	if docker exec "$container" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" 2>/dev/null | gzip >"$dump"; then
		ok "дамп сохранён: $dump ($(du -h "$dump" | cut -f1))"
	else
		rm -f "$dump"
		warn "не удалось снять дамп базы — развёртывание продолжается"
	fi
	prune_backups 'db-*.sql.gz'
}

# Сканы, фото конспектов и PDF лежат в томе, а не в базе: дамп их не спасёт.
backup_uploads() {
	[[ $BACKUP_BEFORE_DEPLOY == yes ]] || return 0
	local container archive
	container=$(running_container backend) || return 0
	step "Резервная копия загруженных файлов"
	mkdir -p "$BACKUP_DIR"
	archive="$BACKUP_DIR/uploads-$(date +%Y%m%d-%H%M%S).tar.gz"
	if docker exec "$container" tar -czf - -C /data uploads 2>/dev/null >"$archive"; then
		ok "архив сохранён: $archive ($(du -h "$archive" | cut -f1))"
	else
		rm -f "$archive"
		warn "не удалось заархивировать загрузки — развёртывание продолжается"
	fi
	prune_backups 'uploads-*.tar.gz'
}

deploy_stack() {
	step "Сборка и запуск контейнеров"
	cd "$APP_DIR"
	docker compose build --pull
	docker compose up -d --remove-orphans
	ok "стек запущен"
}

wait_for_app() {
	step "Проверка приложения"
	local host=$HTTP_BIND body
	[[ $host == 0.0.0.0 || $host == '::' ]] && host=127.0.0.1
	for _ in $(seq 1 90); do
		body=$(curl -fsS --max-time 5 "http://$host:$HTTP_PORT/api/health" 2>/dev/null || true)
		if [[ $body == *'"app":"edway"'* ]]; then
			ok "интерфейс и API отвечают на http://$host:$HTTP_PORT/"
			[[ $body == *'"ocr":"ok"'* ]] || warn "tesseract в образе не найден — бланки тестов придётся проверять вручную"
			return 0
		fi
		sleep 2
	done
	(cd "$APP_DIR" && docker compose ps) || true
	die "приложение не поднялось за 3 минуты — смотрите журнал: cd $APP_DIR && docker compose logs backend"
}

install_error_pages() {
	local src="$APP_DIR/frontend/public/errors"
	mkdir -p "$ERROR_PAGES_DIR"
	if compgen -G "$src/*.html" >/dev/null; then
		install -m 0644 "$src"/*.html "$ERROR_PAGES_DIR"/
	fi
}

# http2 в NGINX 1.25.1+ включается отдельной директивой, в старых — в listen.
nginx_http2() {
	local version major minor patch
	version=$(nginx -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p')
	IFS=. read -r major minor patch <<<"$version"
	if (( major > 1 || minor > 25 || (minor == 25 && ${patch:-0} >= 1) )); then
		printf 'new'
	else
		printf 'old'
	fi
}

proxy_block() {
	cat <<EOF
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:$HTTP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Распознавание пачки бланков занимает минуту-другую.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_request_buffering off;
    }

    error_page 502 503 504 /edway-errors/502.html;
    location ^~ /edway-errors/ {
        alias $ERROR_PAGES_DIR/;
        internal;
    }
EOF
}

# Первый шаг: только HTTP — чтобы Let's Encrypt мог проверить домен.
write_http_site() {
	{
		printf '# Управляется edway deploy.sh — правки перезапишутся при следующем запуске.\n'
		printf 'server {\n    listen 80;\n    listen [::]:80;\n    server_name %s;\n\n' "$DOMAIN"
		printf '    location ^~ /.well-known/acme-challenge/ {\n        root %s;\n    }\n\n' "$ACME_ROOT"
		proxy_block
		printf '}\n'
	} >"$NGINX_SITE"
}

write_https_site() {
	local cert=$1 key=$2 http2 listen_extra=''
	http2=$(nginx_http2)
	[[ $http2 == old ]] && listen_extra=' http2'
	{
		printf '# Управляется edway deploy.sh — правки перезапишутся при следующем запуске.\n'
		printf 'server {\n    listen 80;\n    listen [::]:80;\n    server_name %s;\n\n' "$DOMAIN"
		printf '    location ^~ /.well-known/acme-challenge/ {\n        root %s;\n    }\n\n' "$ACME_ROOT"
		printf '    location / {\n        return 301 https://$host$request_uri;\n    }\n}\n\n'
		printf 'server {\n    listen 443 ssl%s;\n    listen [::]:443 ssl%s;\n' "$listen_extra" "$listen_extra"
		[[ $http2 == new ]] && printf '    http2 on;\n'
		printf '    server_name %s;\n\n' "$DOMAIN"
		printf '    ssl_certificate %s;\n    ssl_certificate_key %s;\n' "$cert" "$key"
		printf '    ssl_protocols TLSv1.2 TLSv1.3;\n'
		printf '    ssl_session_cache shared:edway_ssl:10m;\n    ssl_session_timeout 1d;\n'
		printf '    add_header Strict-Transport-Security "max-age=31536000" always;\n\n'
		proxy_block
		printf '}\n'
	} >"$NGINX_SITE"
}

reload_nginx() {
	nginx -t >/dev/null 2>&1 || { nginx -t; die "NGINX не принял конфигурацию $NGINX_SITE"; }
	if systemctl is-active --quiet nginx; then
		systemctl reload nginx
	else
		systemctl start nginx
	fi
}

issue_letsencrypt() {
	local live="/etc/letsencrypt/live/$DOMAIN"
	if [[ -f $live/fullchain.pem ]]; then
		info "сертификат для $DOMAIN уже есть — certbot продлит его сам"
		return 0
	fi
	local args=(certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" --email "$ACME_EMAIL" --agree-tos --non-interactive --keep-until-expiring)
	[[ $LETSENCRYPT_STAGING == yes ]] && args+=(--staging)
	info "запрашиваю сертификат Let's Encrypt для $DOMAIN"
	certbot "${args[@]}" >/dev/null 2>&1 || {
		certbot "${args[@]}" || true
		die "Let's Encrypt не выдал сертификат. Проверьте, что A-запись $DOMAIN указывает на этот сервер, а порт 80 открыт снаружи"
	}
}

install_renew_hook() {
	mkdir -p "$(dirname "$RENEW_HOOK")"
	cat >"$RENEW_HOOK" <<'EOF'
#!/bin/sh
# После продления сертификата NGINX должен перечитать его с диска.
systemctl reload nginx
EOF
	chmod +x "$RENEW_HOOK"
	systemctl enable --now certbot.timer >/dev/null 2>&1 || true
}

issue_selfsigned() {
	mkdir -p "$SELF_SIGNED_DIR"
	[[ -f $SELF_SIGNED_DIR/cert.pem ]] && return 0
	openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
		-keyout "$SELF_SIGNED_DIR/key.pem" -out "$SELF_SIGNED_DIR/cert.pem" \
		-subj "/CN=$DOMAIN" -addext "subjectAltName=DNS:$DOMAIN" >/dev/null 2>&1
	chmod 600 "$SELF_SIGNED_DIR/key.pem"
}

configure_nginx() {
	step "Настройка NGINX"
	mkdir -p "$ACME_ROOT" "$(dirname "$NGINX_SITE")" "$(dirname "$NGINX_LINK")"
	install_error_pages
	[[ -f $NGINX_SITE ]] && backup_path "$NGINX_SITE"
	write_http_site
	ln -sfn "$NGINX_SITE" "$NGINX_LINK"
	reload_nginx

	case $TLS_MODE in
		letsencrypt)
			issue_letsencrypt
			install_renew_hook
			write_https_site "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "/etc/letsencrypt/live/$DOMAIN/privkey.pem"
			reload_nginx
			ok "HTTPS с сертификатом Let's Encrypt, продление — certbot.timer"
			;;
		selfsigned)
			issue_selfsigned
			write_https_site "$SELF_SIGNED_DIR/cert.pem" "$SELF_SIGNED_DIR/key.pem"
			reload_nginx
			ok "HTTPS с самоподписанным сертификатом ($SELF_SIGNED_DIR)"
			;;
		off)
			ok "только HTTP — шифрование должен обеспечить внешний прокси"
			;;
	esac
}

configure_firewall() {
	[[ $FIREWALL == ufw ]] || return 0
	step "Фаервол"
	apt_install ufw
	ufw allow "$SSH_PORT/tcp" >/dev/null
	ufw allow 80/tcp >/dev/null
	ufw allow 443/tcp >/dev/null
	ufw --force enable >/dev/null
	ok "ufw включён: открыты $SSH_PORT, 80, 443"
}

wait_for_https() {
	[[ $TLS_MODE == off ]] && return 0
	step "Проверка HTTPS"
	local curl_opts=(-fsS -o /dev/null --max-time 10) code
	[[ $TLS_MODE == selfsigned || $LETSENCRYPT_STAGING == yes ]] && curl_opts+=(-k)
	for _ in $(seq 1 12); do
		code=$(curl "${curl_opts[@]}" -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" 2>/dev/null || true)
		if [[ $code == 200 ]]; then
			ok "https://$DOMAIN/ отвечает"
			return 0
		fi
		sleep 5
	done
	warn "https://$DOMAIN/ пока не отвечает — проверьте: journalctl -u nginx -n 50"
}

# Администратор создаётся здесь, а не при старте сервера: так пароль виден
# ровно один раз — в выводе этого скрипта, и нигде не хранится открыто.
init_admin() {
	step "Системный администратор"
	local result
	result=$(cd "$APP_DIR" && docker compose exec -T backend node scripts/admin-init.mjs 2>/dev/null | tail -n1 || true)
	ADMIN_STATUS=$(sed -n 's/.*"status":"\([a-z]*\)".*/\1/p' <<<"$result")
	ADMIN_NAME=$(sed -n 's/.*"login":"\([^"]*\)".*/\1/p' <<<"$result")
	ADMIN_TEMP=$(sed -n 's/.*"password":"\([^"]*\)".*/\1/p' <<<"$result")
	case $ADMIN_STATUS in
		created) ok "создан: $ADMIN_NAME" ;;
		reissued) ok "ещё не входил — выдан новый временный пароль" ;;
		exists) ok "уже настроен ($ADMIN_NAME) — пароль не меняется" ;;
		*) warn "не удалось создать администратора: $result"; warn "повторите: cd $APP_DIR && sudo docker compose exec backend npm run admin:init" ;;
	esac
}

summary() {
	local scheme=https
	[[ $TLS_MODE == off ]] && scheme=http

	printf '\n%s==> Развёртывание завершено%s\n\n' "$C_OK" "$C_RESET"
	printf '  Адрес:            %s://%s\n' "$scheme" "$DOMAIN"
	printf '  Каталог:          %s\n' "$APP_DIR"
	printf '  Секреты:          %s (права 600)\n' "$ENV_FILE"
	printf '  Конфиг NGINX:     %s\n' "$NGINX_SITE"
	printf '  Резервные копии:  %s\n\n' "$BACKUP_DIR"

	if [[ -n ${ADMIN_TEMP:-} ]]; then
		printf '  %sВход системного администратора%s\n' "$C_BOLD" "$C_RESET"
		printf '    логин:            %s%s%s\n' "$C_BOLD" "$ADMIN_NAME" "$C_RESET"
		printf '    временный пароль: %s%s%s\n\n' "$C_BOLD" "$ADMIN_TEMP" "$C_RESET"
		printf '  Пароль показан один раз. При первом входе платформа потребует сменить\n'
		printf '  его и подключить второй фактор (Яндекс Ключ, Google Authenticator).\n'
		printf '  Дальше: настройте школу и звонки, заведите завучей — они заведут\n'
		printf '  классы, учителей и учеников.\n\n'
	fi

	printf '  Служебные команды (из каталога платформы, от root):\n'
	printf '    cd %s\n' "$APP_DIR"
	printf '    sudo docker compose logs -f                              журнал\n'
	printf '    sudo docker compose exec backend npm run admin:reset     вернуть доступ администратору\n'
	printf '    sudo docker compose exec backend npm run demo:seed       показательные данные\n'
	printf '  Обновление:       git pull && sudo ./deploy.sh\n\n'
}

main() {
	parse_args "$@"
	load_config
	validate_config

	if [[ $CHECK_ONLY == yes ]]; then
		step "Проверка окружения"
		[[ $EUID -eq 0 ]] || warn "скрипт запущен не от root: для развёртывания понадобится sudo"
		detect_os
		check_dns
		[[ $EUID -eq 0 ]] && check_ports
		if command -v docker >/dev/null; then ok "docker: $(docker --version)"; check_app_port; else info "docker будет установлен"; fi
		if command -v nginx >/dev/null; then ok "nginx: $(nginx -v 2>&1)"; else info "nginx будет установлен"; fi
		printf '\n%sПроверка пройдена, изменений не вносилось.%s\n\n' "$C_OK" "$C_RESET"
		exit 0
	fi

	require_root
	detect_os
	check_dns
	check_ports

	if [[ $SKIP_PACKAGES == no ]]; then
		install_base_packages
		install_docker
		install_nginx
	else
		info "установка пакетов пропущена (--skip-packages)"
		command -v docker >/dev/null || die "Docker не установлен"
		command -v nginx >/dev/null || die "NGINX не установлен"
		[[ $TLS_MODE != letsencrypt ]] || command -v certbot >/dev/null || die "certbot не установлен"
	fi

	check_app_port
	disable_conflicting
	sync_sources
	mkdir -p "$BACKUP_DIR"
	backup_database
	backup_uploads
	write_env
	deploy_stack
	wait_for_app
	configure_nginx
	configure_firewall
	wait_for_https
	init_admin
	summary
}

main "$@"
