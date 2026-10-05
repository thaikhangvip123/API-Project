SMALL_NUMBERS = (
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
)

TENS = (
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
)

MIN_VALUE = -999_999_999
MAX_VALUE = 999_999_999


def _under_thousand(value):
    parts = []
    hundreds, remainder = divmod(value, 100)

    if hundreds:
        parts.extend((SMALL_NUMBERS[hundreds], "hundred"))

    if remainder >= 20:
        tens, ones = divmod(remainder, 10)
        parts.append(TENS[tens] if not ones else f"{TENS[tens]}-{SMALL_NUMBERS[ones]}")
    elif remainder:
        parts.append(SMALL_NUMBERS[remainder])

    return " ".join(parts)


def number_to_words(value):
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError("value must be an integer")
    if not MIN_VALUE <= value <= MAX_VALUE:
        raise ValueError(f"value must be between {MIN_VALUE} and {MAX_VALUE}")
    if value == 0:
        return SMALL_NUMBERS[0]
    if value < 0:
        return f"minus {number_to_words(-value)}"

    parts = []
    for divisor, label in ((1_000_000, "million"), (1_000, "thousand"), (1, "")):
        chunk, value = divmod(value, divisor)
        if chunk:
            parts.append(_under_thousand(chunk))
            if label:
                parts.append(label)

    return " ".join(parts)
