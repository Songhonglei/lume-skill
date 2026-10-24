#!/usr/bin/env python3
import os
import sys

passed = os.environ.get("EVAL_FINAL_MESSAGE", "").strip() == "LABEL: (empty)"
print("空文本标签正确" if passed else "空文本标签不符合约定")
sys.exit(0 if passed else 1)
