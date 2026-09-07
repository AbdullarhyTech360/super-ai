from uuid import uuid4

def generate_uuid() -> str:
    """
    Generate a new UUID string.

    Returns:
        str: A new UUID string.
    """
    return str(uuid4())