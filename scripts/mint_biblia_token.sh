#!/bin/zsh
# Mint permanent page token for Biblia Tafsiri Mbalimbali + verify FB & IG access
set -e
GRAPH="https://graph.facebook.com/v21.0"
UT="EAAT10ngyYUsBSugKUC3ZA3yskvvrvtSfRZAjZCa0eg1fbwqjJDsofiZB0rvTDilFHAZByzacHdbmVGCZB7kHpIMvcAAA599SZBkScJTJzjZB1uD8HgCMzK5l7HvzfZCKLkZBGADMQZAVcjMDu42tDpDCsh8ao2a7ZCLhbwj1LJf13XslQ5U4XMk76ptYeP5MOpZA0tdN1SHfPmfsMVITzqnie3bKlCps9CwSLKxOXIRbgrxZA3GWQrRmUZCjRqCPAZDZD"
APPID="1396184215347531"
APPSECRET="c2e2387de1cefa6b8c95a963b49f5c6d"
PAGEID="447560908444853"

# Step 1: exchange to long-lived (cached)
if [ -f /tmp/biblia_llt.txt ]; then
  LLT=$(cat /tmp/biblia_llt.txt)
else
  LLT=$(curl -s "$GRAPH/oauth/access_token?grant_type=fb_exchange_token&client_id=${APPID}&client_secret=${APPSECRET}&fb_exchange_token=${UT}" | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
  printf '%s' "$LLT" > /tmp/biblia_llt.txt
fi
echo "LLT: ${LLT:0:25}..."

# Step 2: mint permanent page token
PERM=$(curl -s "$GRAPH/${PAGEID}?fields=access_token&access_token=${LLT}" | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
printf '%s' "$PERM" > /tmp/biblia_page_token.txt
echo "PERM: ${PERM:0:25}..."

# Step 3: verify
echo "--- debug_token ---"
curl -s "$GRAPH/debug_token?input_token=${PERM}&access_token=${PERM}" | python3 -m json.tool
echo "--- page + IG ---"
curl -s "$GRAPH/${PAGEID}?fields=name,username,instagram_business_account{id,username,followers_count}&access_token=${PERM}" | python3 -m json.tool
echo "--- IG publish capability (media edge, read-only GET) ---"
curl -s "$GRAPH/17841470180666328/media?fields=id&limit=1&access_token=${PERM}" | python3 -m json.tool
