"""Emit a bounded greeting as JSON; no files, network or subprocesses."""
import argparse
import json


def greet(name):
    """Return a greeting for a 1–80 character nonblank name."""
    name=name.strip()
    if not 1 <= len(name) <= 80:
        raise ValueError("Name must contain 1–80 characters")
    return {"message": f"Hello, {name}!"


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name",required=True,help="1–80 character name")
    args=parser.parse_args()
    try:
        print(json.dumps(greet(args.name),ensure_ascii=False))
    except ValueError as error:
        parser.error(str(error))


if __name__=="__main__":
    main()
