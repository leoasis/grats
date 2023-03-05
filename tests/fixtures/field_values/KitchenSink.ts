@ObjectType
export default class Query {
  @Field
  hello(args: { greeting: string }): string {
    return `${args.greeting ?? "Hello"} world!`;
  }

  @Field
  greetings(args: { greeting: string }): string[] {
    return [`${args.greeting ?? "Hello"} world!`];
  }
  @Field
  greetings1(args: { greeting: string }): Array<string> {
    return [`${args.greeting ?? "Hello"} world!`];
  }
  @Field
  greetings2(args: { greeting: string }): ReadonlyArray<string> {
    return [`${args.greeting ?? "Hello"} world!`];
  }

  @Field
  me(): User {
    return new User();
  }
}

@ObjectType
class User {
  @Field
  name(): string {
    return "Alice";
  }
  @Field
  groups(): Group[] {
    return [new Group()];
  }
}

@ObjectType
class Group {
  @Field
  description: string;

  constructor() {
    this.description = "A group of people";
  }

  @Field
  name(): string {
    return "Pal's Club";
  }
  @Field
  async members(): Promise<User[]> {
    return [new User()];
  }
}
