#!/usr/bin/env bash
# Make 백업 시나리오 3개 생성 스크립트
# 사용 방법: MAKE_API_KEY=your_token bash scripts/setup-make-scenarios.sh

if [ -z "$MAKE_API_KEY" ]; then
  echo "❌ MAKE_API_KEY 환경변수를 설정해주세요."
  echo "   MAKE_API_KEY=your_token bash scripts/setup-make-scenarios.sh"
  exit 1
fi

TEAM_ID=2567117
MAKE_BASE="https://eu1.make.com/api/v2"
CRON_SECRET="BBK_CRON_2024_xK9mPqR3vLwZnYeA"
BBK_URL="https://bbk-app.vercel.app"

create_http_scenario() {
  local NAME="$1"
  local ENDPOINT="$2"
  local SCHEDULE_HOUR="$3"
  local SCHEDULE_MINUTE="$4"

  echo "시나리오 생성 중: $NAME ..."

  RESPONSE=$(curl -s -X POST "$MAKE_BASE/scenarios" \
    -H "Authorization: Token $MAKE_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"teamId\": $TEAM_ID,
      \"name\": \"$NAME\",
      \"blueprint\": {
        \"name\": \"$NAME\",
        \"flow\": [
          {
            \"id\": 1,
            \"module\": \"http:ActionSendData\",
            \"version\": 3,
            \"parameters\": { \"handleErrors\": false },
            \"mapper\": {
              \"url\": \"$BBK_URL$ENDPOINT\",
              \"method\": \"post\",
              \"headers\": [
                { \"name\": \"Authorization\", \"value\": \"Bearer $CRON_SECRET\" },
                { \"name\": \"Content-Type\", \"value\": \"application/json\" }
              ],
              \"bodyType\": \"raw\",
              \"contentType\": \"application/json\",
              \"data\": \"{}\"
            }
          }
        ],
        \"metadata\": {
          \"version\": 1,
          \"scenario\": {
            \"roundtrips\": 1,
            \"maxErrors\": 3,
            \"autoCommit\": true
          }
        }
      }
    }")

  SCENARIO_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('scenario',{}).get('id',''))" 2>/dev/null)

  if [ -z "$SCENARIO_ID" ]; then
    echo "❌ $NAME 생성 실패"
    echo "응답: $RESPONSE"
    return 1
  fi

  echo "✅ $NAME 생성 완료 (ID: $SCENARIO_ID)"

  # 활성화
  ACTIVATE=$(curl -s -X POST "$MAKE_BASE/scenarios/$SCENARIO_ID/activate" \
    -H "Authorization: Token $MAKE_API_KEY" \
    -H "Content-Type: application/json")

  echo "활성화 결과: $ACTIVATE"
  echo ""
  echo "$SCENARIO_ID"
}

echo "🚀 Make 백업 시나리오 생성 시작..."
echo ""

# 1. Notion 백업 (03:30 KST = 18:30 UTC)
NOTION_ID=$(create_http_scenario \
  "BBK-Backup-Notion-Daily" \
  "/api/admin/backup/notion" \
  18 30)

# 2. Storage JSON 백업 (03:30 KST = 18:30 UTC)
STORAGE_ID=$(create_http_scenario \
  "BBK-Backup-Storage-Daily" \
  "/api/admin/backup/storage" \
  18 30)

# 3. 정리 Cron (04:00 KST = 19:00 UTC)
CLEANUP_ID=$(create_http_scenario \
  "BBK-Backup-Cleanup-Daily" \
  "/api/cron/cleanup-backups" \
  19 0)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Make 시나리오 생성 완료"
echo "BBK-Backup-Notion-Daily  ID: $NOTION_ID"
echo "BBK-Backup-Storage-Daily ID: $STORAGE_ID"
echo "BBK-Backup-Cleanup-Daily ID: $CLEANUP_ID"
echo ""
echo "💡 Make 대시보드에서 스케줄을 수동으로 설정하세요:"
echo "   https://eu1.make.com/scenarios"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
