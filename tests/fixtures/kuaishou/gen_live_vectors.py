#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 KuaiShou-Spider 的 live_proto 生成直播帧黄金向量。

输出 tests/fixtures/kuaishou/live-vectors.json：
上行帧的 hex，以及手造 SCWebFeedPush（gzip / raw deflate / AES / 不压缩）的解码结果。
"""
from __future__ import annotations

import gzip
import json
import os
import sys
import zlib

from Crypto.Cipher import AES

ROOT = "/tmp/KuaiShou-Spider"
sys.path.insert(0, ROOT)

from utils.live_proto import (  # noqa: E402
    _zigzag_decode,
    decode_frame,
    decode_message,
    encode_message,
    enter_room_frame,
    heartbeat_frame,
    user_exit_frame,
)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "live-vectors.json")
TS = 1700000000123
AES_KEY = b"PPbzKKL7NB15leYy"
AES_IV = b"JRODKJiolJ9xqso0"


def to_jsonable(obj):
    if isinstance(obj, bytes):
        return {"__bytes__": obj.hex()}
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    return obj


def write_varint(value: int) -> bytes:
    out = bytearray()
    value &= (1 << 64) - 1
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def pkcs7(data: bytes) -> bytes:
    pad = 16 - (len(data) % 16)
    return data + bytes([pad]) * pad


def frame(compression: int, payload: bytes) -> bytes:
    return encode_message(
        {"payloadType": 310, "compressionType": compression, "payload": payload},
        "SocketMessage",
    )


def main() -> None:
    feed = {
        "displayWatchingCount": "1.2万",
        "displayLikeCount": "300",
        "pendingLikeCount": 7,
        "commentFeeds": [
            {
                "id": "c1",
                "user": {
                    "principalId": "u1",
                    "userName": "张三",
                    "headUrl": "https://img.example/a.jpg",
                    "mystery": True,
                },
                "content": "你好，世界",
                "sortRank": 10,
                "showType": 1,
                "time": TS,
            }
        ],
        "likeFeeds": [
            {
                "id": "l1",
                "user": {"principalId": "u2", "userName": "李四"},
                "sortRank": 3,
            }
        ],
        "giftFeeds": [
            {
                "id": "g1",
                "user": {"principalId": "u3", "userName": "王五"},
                "time": TS,
                "giftId": 9,
                "batchSize": 2,
                "comboCount": 5,
                "mergeKey": "mk",
            }
        ],
        "systemNoticeFeeds": [
            {
                "id": "s1",
                "content": "系统通知",
                "time": TS,
                "displayType": 1,
            }
        ],
    }
    body = encode_message(feed, "SCWebFeedPush")
    gzipped = gzip.compress(body)
    compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
    raw_deflate = compressor.compress(body) + compressor.flush()
    aes_payload = AES.new(AES_KEY, AES.MODE_CBC, AES_IV).encrypt(pkcs7(body))

    enter = enter_room_frame(
        "tok", "stream1", page_id="p1", reconnect_count=2, exp_tag="exp", attach="att"
    )
    enter_min = enter_room_frame("tok", "stream1")
    heart = heartbeat_frame(TS)
    exit_frame = user_exit_frame(TS)
    gzip_frame = frame(2, gzipped)
    aes_frame = frame(3, aes_payload)
    none_frame = frame(1, body)
    deflate_frame = frame(2, raw_deflate)
    unknown = encode_message({"payloadType": 510, "payload": b"\x01\x02"}, "SocketMessage")

    inner = encode_message({"timestamp": 5}, "CSWebHeartbeat")
    duplicate = inner + write_varint(1 << 3) + write_varint(6)
    unknown_field = inner + write_varint(99 << 3) + write_varint(5)

    vectors = {
        "timestamp": TS,
        "enterRoom": {
            "token": "tok",
            "liveStreamId": "stream1",
            "pageId": "p1",
            "reconnectCount": 2,
            "expTag": "exp",
            "attach": "att",
            "hex": enter.hex(),
            "decoded": to_jsonable(decode_frame(enter)),
        },
        "enterRoomMinimal": {
            "token": "tok",
            "liveStreamId": "stream1",
            "hex": enter_min.hex(),
        },
        "heartbeat": {"timestamp": TS, "hex": heart.hex()},
        "userExit": {"timestamp": TS, "hex": exit_frame.hex()},
        "feedInput": feed,
        "feedBody": body.hex(),
        "feedDecoded": to_jsonable(decode_message(body, "SCWebFeedPush")),
        "feedPushGzip": {
            "hex": gzip_frame.hex(),
            "decoded": to_jsonable(decode_frame(gzip_frame)),
        },
        "feedPushAes": {
            "hex": aes_frame.hex(),
            "decoded": to_jsonable(decode_frame(aes_frame)),
        },
        "feedPushNone": {
            "hex": none_frame.hex(),
            "decoded": to_jsonable(decode_frame(none_frame)),
        },
        "feedPushRawDeflate": {
            "hex": deflate_frame.hex(),
            "decoded": to_jsonable(decode_frame(deflate_frame)),
        },
        "unknownType": {
            "hex": unknown.hex(),
            "decoded": to_jsonable(decode_frame(unknown)),
        },
        "zigzag": [{"in": n, "out": _zigzag_decode(n)} for n in (0, 1, 2, 3, 4, 5, 2**40 + 1, 2**40 + 2)],
        "duplicateTimestamp": {
            "hex": duplicate.hex(),
            "decoded": to_jsonable(decode_message(duplicate, "CSWebHeartbeat")),
        },
        "unknownField": {
            "hex": unknown_field.hex(),
            "decoded": to_jsonable(decode_message(unknown_field, "CSWebHeartbeat")),
        },
    }
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(vectors, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
