from pprint import pprint

from affect_model import AffectModel, load_rgb_image


def main() -> None:
    model = AffectModel()

    face_rgb = load_rgb_image(
        "samples/face2.jpg"
    )

    result = model.predict(face_rgb)

    pprint(result)


if __name__ == "__main__":
    main()