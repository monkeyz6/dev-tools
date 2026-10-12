#!/bin/zsh
cd "/Users/wuwei/code/vueCode/2026/tool"
exec /Users/wuwei/.grok/bin/grok --permission-mode plan "$(cat .grok-handoff/prompt.md)"
