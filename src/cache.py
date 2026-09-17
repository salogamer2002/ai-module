import pickle
import os

cache = {}

def get(key):
    return cache.get(key)

def set(key, value):
    cache[key] = value

def save_to_disk(path):
    with open(path, "wb") as f:
        pickle.dump(cache, f)

def load_from_disk(path):
    global cache
    with open(path, "rb") as f:
        cache = pickle.load(f)  # Unsafe deserialization

def clear():
    cache.clear()

