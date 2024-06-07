import {
  Embeddable,
  Embedded,
  Entity,
  Enum,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { mockLogger } from '../../helpers';

export enum AnimalType {
  CAT,
  DOG,
}

@Embeddable()
export class CatFood {

  @Property()
  mice: number;

  constructor(mice: number) {
    this.mice = mice;
  }

}

@Embeddable()
export class DogFood {

  @Property()
  bones: number;

  constructor(bones: number) {
    this.bones = bones;
  }

}

@Embeddable({ abstract: true, discriminatorColumn: 'type' })
export abstract class Animal {

  @Enum()
  type!: AnimalType;

  @Property()
  name!: string;

  constructor(type: AnimalType) {
    this.type = type;
  }

}

@Embeddable({ discriminatorValue: AnimalType.CAT })
export class Cat extends Animal {

  @Embedded()
  food: CatFood;

  constructor(name: string, mice: number) {
    super(AnimalType.CAT);
    this.type = AnimalType.CAT;
    this.food = new CatFood(mice);
    this.name = name;
  }

}

@Embeddable({ discriminatorValue: AnimalType.DOG })
export class Dog extends Animal {

  @Embedded()
  food: DogFood;

  constructor(name: string, bones: number) {
    super(AnimalType.DOG);
    this.type = AnimalType.DOG;
    this.food = new DogFood(bones);
    this.name = name;
  }

}

@Entity()
class Owner {

  @PrimaryKey()
  id!: number;

  @Property()
  name: string;

  @Embedded(() => [Cat, Dog])
  pet!: Cat | Dog;

  @Embedded(() => [Cat, Dog], { object: true })
  pet2!: Cat | Dog;

  constructor(name: string) {
    this.name = name;
  }

}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    entities: [Owner, Cat, Dog, CatFood, DogFood],
    driver: PostgreSqlDriver,
    dbName: `:memory:`,
  });
  await orm.schema.refreshDatabase();
});

beforeEach(async () => {
  await orm.schema.clearDatabase();
});

afterAll(async () => {
  await orm.close(true);
});


test(`#2987`, async () => {
  const ent1 = new Owner('o1');
  ent1.pet = new Dog('d1', 10);
  ent1.pet2 = new Cat('c1', 2);
  expect(ent1.pet).toBeInstanceOf(Dog);
  expect((ent1.pet as Dog).food.bones).toBe(10);
  expect(ent1.pet2).toBeInstanceOf(Cat);
  expect((ent1.pet2 as Cat).food.mice).toBe(2);

  const mock = mockLogger(orm, ['query']);
  await orm.em.persistAndFlush([ent1]);
  expect(mock.mock.calls[0][0]).toMatch('begin');
  expect(mock.mock.calls[1][0]).toMatch(
    'insert into "owner" ("name", "pet_food_bones", "pet_type", "pet_name", "pet2") values ($1, $2, $3, $4, $5) returning "id"',
  );
  expect(mock.mock.calls[2][0]).toMatch('commit');
  orm.em.clear();

  const owners = await orm.em.find(Owner, {}, { orderBy: { name: 1 } });
  expect(mock.mock.calls[3][0]).toMatch(
    'select "o0".* from "owner" as "o0" order by "o0"."name" asc',
  );
  expect(owners[0].pet.food).toBeInstanceOf(DogFood);
  expect(owners[0].pet2.food).toBeInstanceOf(CatFood);
});
