@ObjectType
export default class Query {
  @Field
  async hello(): Promise<string> {
    return "Hello world!";
  }
}
