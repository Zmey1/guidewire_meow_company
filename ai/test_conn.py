import logging
logging.basicConfig(level=logging.INFO)
from fraud import get_driver, close_driver

try:
    print("Testing connection...")
    driver = get_driver()
    with driver.session() as session:
        res = session.run("MATCH (n) RETURN count(n) AS c")
        print("AURA_SUCCESS:", res.single()["c"])
except Exception as e:
    print("AURA_ERROR:", repr(e))
finally:
    close_driver()
